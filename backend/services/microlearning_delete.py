from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional
from urllib.parse import unquote, urlparse

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from ..models import (
    CertificateRecord,
    MicrolearningAssignment,
    MicrolearningModule,
    MicrolearningUploadedAsset,
)
from ..supabase_client import SupabaseClient

logger = logging.getLogger(__name__)

SUPABASE_PUBLIC_OBJECT_MARKER = "/storage/v1/object/public/"


class MicrolearningDeleteError(RuntimeError):
    """Raised when a module delete cannot be completed safely."""


@dataclass(frozen=True)
class StorageDeletionTarget:
    kind: str
    locator: str
    source: str
    bucket: Optional[str] = None
    path: Optional[str] = None


@dataclass
class ModuleDeleteSummary:
    module_id: str
    module_title: str
    deleted_assignment_count: int = 0
    deleted_certificate_count: int = 0
    deleted_storage_count: int = 0
    impacted_trainee_ids: list[str] = field(default_factory=list)
    impacted_batch_ids: list[str] = field(default_factory=list)
    deleted_storage_items: list[str] = field(default_factory=list)


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _resolve_supabase_public_target(value: str) -> Optional[tuple[str, str]]:
    normalized = _normalize_text(value)
    if not normalized:
        return None

    parsed = urlparse(normalized)
    if not parsed.scheme or not parsed.netloc:
        return None

    marker_index = parsed.path.find(SUPABASE_PUBLIC_OBJECT_MARKER)
    if marker_index < 0:
        return None

    suffix = parsed.path[marker_index + len(SUPABASE_PUBLIC_OBJECT_MARKER):]
    if "/" not in suffix:
        return None

    bucket_name, object_path = suffix.split("/", 1)
    bucket_name = unquote(bucket_name).strip()
    object_path = unquote(object_path).strip().lstrip("/")
    if not bucket_name or not object_path:
        return None

    return bucket_name, object_path


def _is_missing_storage_error(error: Exception) -> bool:
    message = _normalize_text(error).lower()
    return any(
        marker in message
        for marker in (
            "not found",
            "status code 404",
            "404",
            "does not exist",
            "no such object",
            "object not found",
        )
    )


def _collect_storage_targets(
    module: MicrolearningModule,
    *,
    audio_content_row: Optional[dict[str, Any]],
    supabase_client: SupabaseClient,
) -> list[StorageDeletionTarget]:
    targets: dict[tuple[str, str], StorageDeletionTarget] = {}

    def register_storage(bucket: str, path: str, source: str) -> None:
        normalized_bucket = _normalize_text(bucket)
        normalized_path = _normalize_text(path).lstrip("/")
        if not normalized_bucket or not normalized_path:
            return

        key = ("storage", f"{normalized_bucket}/{normalized_path}")
        targets[key] = StorageDeletionTarget(
            kind="storage",
            locator=f"{normalized_bucket}/{normalized_path}",
            source=source,
            bucket=normalized_bucket,
            path=normalized_path,
        )

    def register_value(value: Any, source: str) -> None:
        normalized = _normalize_text(value)
        if not normalized:
            return

        if source.endswith("storage_path"):
            register_storage(supabase_client.microlearning_bucket_name, normalized, source)
            return

        public_target = _resolve_supabase_public_target(normalized)
        if public_target:
            register_storage(public_target[0], public_target[1], source)

    content_data = module.content_data if isinstance(module.content_data, dict) else {}
    for field_name in (
        "content_url",
        "audio_url",
        "audio_tts_url",
    ):
        register_value(getattr(module, field_name, None), f"module.{field_name}")

    for key in (
        "asset_url",
        "audio_url",
        "tts_url",
        "captions_url",
    ):
        register_value(content_data.get(key), f"module.content_data.{key}")

    asset_storage_path = _normalize_text(content_data.get("asset_storage_path"))
    if asset_storage_path:
        register_storage(
            _normalize_text(content_data.get("asset_bucket")) or supabase_client.microlearning_bucket_name,
            asset_storage_path,
            "module.content_data.asset_storage_path",
        )

    audio_storage_path = _normalize_text(content_data.get("audio_storage_path"))
    if audio_storage_path:
        register_storage(
            _normalize_text(content_data.get("audio_bucket")) or supabase_client.microlearning_bucket_name,
            audio_storage_path,
            "module.content_data.audio_storage_path",
        )

    if audio_content_row:
        register_value(audio_content_row.get("storage_path"), "audio_content.storage_path")
        register_value(audio_content_row.get("url"), "audio_content.url")

    return list(targets.values())


def _delete_supabase_object(
    supabase_client: SupabaseClient,
    *,
    bucket_name: str,
    path: str,
) -> bool:
    if not supabase_client.is_available or supabase_client.client is None:
        raise MicrolearningDeleteError(
            "Rollback notice: the module record was left intact because Supabase storage is not available for cleanup."
        )

    try:
        supabase_client.client.storage.from_(bucket_name).remove([path])
        return True
    except Exception as exc:
        if _is_missing_storage_error(exc):
            logger.info(
                "Microlearning storage target already absent, continuing delete: %s/%s",
                bucket_name,
                path,
            )
            return True
        raise


def _cleanup_storage_targets(
    targets: list[StorageDeletionTarget],
    *,
    supabase_client: SupabaseClient,
) -> tuple[int, list[str]]:
    deleted_count = 0
    deleted_items: list[str] = []

    for target in targets:
        try:
            was_deleted = False
            if target.kind == "storage" and target.bucket and target.path:
                was_deleted = _delete_supabase_object(
                    supabase_client,
                    bucket_name=target.bucket,
                    path=target.path,
                )

            if was_deleted:
                deleted_count += 1
                deleted_items.append(target.locator)
        except MicrolearningDeleteError:
            raise
        except Exception as exc:
            logger.exception("Failed to delete microlearning storage target %s", target.locator)
            raise MicrolearningDeleteError(
                "Rollback notice: the module record was left intact because one or more storage files could not be deleted."
            ) from exc

    return deleted_count, deleted_items


def _fetch_audio_content_row(
    supabase_client: SupabaseClient,
    *,
    module_id: str,
) -> Optional[dict[str, Any]]:
    if not supabase_client.is_available or supabase_client.client is None:
        return None

    try:
        response = (
            supabase_client.client
            .table("audio_content")
            .select("id,module_id,url,storage_path")
            .eq("module_id", module_id)
            .limit(1)
            .execute()
        )
    except Exception:
        logger.warning("Unable to inspect audio_content for module %s", module_id)
        return None

    data = getattr(response, "data", None) or []
    if isinstance(data, list) and data:
        first_row = data[0]
        if isinstance(first_row, dict):
            return first_row
    if isinstance(data, dict):
        return data
    return None


def _delete_audio_content_row(
    supabase_client: SupabaseClient,
    *,
    audio_content_id: str,
) -> None:
    if (
        not _normalize_text(audio_content_id)
        or not supabase_client.is_available
        or supabase_client.client is None
    ):
        return

    try:
        (
            supabase_client.client
            .table("audio_content")
            .delete()
            .eq("id", audio_content_id)
            .execute()
        )
    except Exception:
        logger.exception("Unable to delete audio_content metadata row %s", audio_content_id)


def delete_microlearning_module_and_dependencies(
    db: Session,
    *,
    module: MicrolearningModule,
    supabase_client: SupabaseClient,
) -> ModuleDeleteSummary:
    module_id = module.id
    module_title = module.title
    assignments = (
        db.query(MicrolearningAssignment)
        .filter(MicrolearningAssignment.module_id == module_id)
        .all()
    )
    assignment_ids = [assignment.id for assignment in assignments if assignment.id]
    trainee_ids = sorted(
        {
            assignment.trainee_id
            for assignment in assignments
            if _normalize_text(assignment.trainee_id)
        }
    )
    batch_ids = sorted(
        {
            assignment.batch_id
            for assignment in assignments
            if _normalize_text(assignment.batch_id)
        }
    )
    certificate_ids = sorted(
        {
            assignment.certificate_id
            for assignment in assignments
            if _normalize_text(assignment.certificate_id)
        }
    )
    content_data = module.content_data if isinstance(module.content_data, dict) else {}
    has_audio_metadata = any(
        _normalize_text(value)
        for value in (
            getattr(module, "audio_url", None),
            getattr(module, "audio_tts_url", None),
            content_data.get("audio_storage_path"),
            content_data.get("audio_content_id"),
        )
    )
    audio_content_row = (
        _fetch_audio_content_row(supabase_client, module_id=module_id)
        if has_audio_metadata
        else None
    )
    asset_record_id = _normalize_text(content_data.get("asset_record_id"))
    storage_targets = _collect_storage_targets(
        module,
        audio_content_row=audio_content_row,
        supabase_client=supabase_client,
    )

    deleted_storage_count, deleted_storage_items = _cleanup_storage_targets(
        storage_targets,
        supabase_client=supabase_client,
    )

    deleted_certificate_count = 0
    try:
        for assignment in assignments:
            db.delete(assignment)

        if assignments:
            db.flush()

        if assignment_ids:
            certificate_filters = [
                and_(
                    CertificateRecord.source_type == "microlearning_assignment",
                    CertificateRecord.source_id.in_(assignment_ids),
                )
            ]
            if certificate_ids:
                certificate_filters.append(CertificateRecord.id.in_(certificate_ids))

            deleted_certificate_count = (
                db.query(CertificateRecord)
                .filter(or_(*certificate_filters))
                .delete(synchronize_session=False)
            )

        if asset_record_id:
            (
                db.query(MicrolearningUploadedAsset)
                .filter(MicrolearningUploadedAsset.id == asset_record_id)
                .delete(synchronize_session=False)
            )

        db.delete(module)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to delete microlearning module %s", module_id)
        raise MicrolearningDeleteError(
            "Delete failed after storage cleanup started. Refresh the library before retrying because some files may already be removed."
        ) from exc

    if audio_content_row:
        _delete_audio_content_row(
            supabase_client,
            audio_content_id=_normalize_text(audio_content_row.get("id")),
        )

    return ModuleDeleteSummary(
        module_id=module_id,
        module_title=module_title,
        deleted_assignment_count=len(assignments),
        deleted_certificate_count=int(deleted_certificate_count or 0),
        deleted_storage_count=deleted_storage_count,
        impacted_trainee_ids=trainee_ids,
        impacted_batch_ids=batch_ids,
        deleted_storage_items=deleted_storage_items,
    )
