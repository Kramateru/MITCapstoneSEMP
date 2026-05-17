"""
Supabase client module for managing cloud storage and database operations
- File uploads to bucket
- Public URL generation
- Assessment data storage
"""

import logging
import os
from typing import Optional, Dict, Any
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urlparse

from .config_validation import (
    classify_supabase_api_key,
    is_usable_supabase_service_key,
    is_usable_supabase_url,
    normalize_env_value,
    resolve_supabase_service_key,
    resolve_supabase_url,
)

logger = logging.getLogger(__name__)

MICROLEARNING_STORAGE_ROOT = "microlearning"
MICROLEARNING_BUCKET_FILE_SIZE_LIMIT = 50 * 1024 * 1024
MICROLEARNING_ALLOWED_MIME_TYPES = [
    "audio/*",
    "video/*",
    "image/*",
    "text/*",
    "application/pdf",
    "application/octet-stream",
]

try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    logger.info("Supabase library not installed. Cloud storage disabled.")


class SupabaseClient:
    """Wrapper for Supabase operations"""

    def __init__(self):
        self.client: Optional[Client] = None
        self.url = resolve_supabase_url(os.getenv)
        self.key = resolve_supabase_service_key(os.getenv)
        self.bucket_name = normalize_env_value(os.getenv("STORAGE_BUCKET_NAME")) or "attachments"
        self.profile_bucket_name = (
            normalize_env_value(os.getenv("PROFILE_STORAGE_BUCKET_NAME")) or "profile-pictures"
        )
        self.call_simulation_bucket_name = (
            normalize_env_value(os.getenv("CALL_SIMULATION_STORAGE_BUCKET_NAME"))
            or "call-recordings"
        )
        self.call_simulation_asset_bucket_name = normalize_env_value(
            os.getenv("CALL_SIMULATION_ASSET_BUCKET_NAME")
        ) or "call-ringers"
        # Shared bucket for trainer-uploaded lesson video and related media.
        self.microlearning_bucket_name = (
            normalize_env_value(os.getenv("MICROLEARNING_STORAGE_BUCKET_NAME"))
            or "microlearning-videos"
        )
        self.is_available = False
        self.config_status = "not_configured"
        self.status_detail = (
            "Supabase service credentials are not configured. "
            "Set SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY to enable storage features."
        )
        self.key_kind = classify_supabase_api_key(self.key)

        if SUPABASE_AVAILABLE and is_usable_supabase_url(self.url) and is_usable_supabase_service_key(self.key):
            try:
                self.client = create_client(self.url, self.key)
                self.is_available = True
                self.config_status = "configured"
                self.status_detail = "Supabase storage client initialized successfully."
                logger.info("Supabase client initialized successfully")
                
                # Ensure required buckets exist
                self._ensure_buckets_exist()
            except Exception as e:
                self.config_status = "invalid"
                self.status_detail = f"Supabase client initialization failed: {e}"
                logger.warning(f"Failed to initialize Supabase: {e}")
        else:
            if not SUPABASE_AVAILABLE:
                self.config_status = "missing_dependency"
                self.status_detail = (
                    "Supabase Python client is not installed. Install the backend dependencies to enable storage features."
                )
                logger.info("Supabase library not available. Install with: pip install supabase")
            elif not self.url:
                self.config_status = "invalid"
                self.status_detail = (
                    "SUPABASE_URL is missing or malformed. Use the project URL from Supabase settings."
                )
                logger.warning(self.status_detail)
            elif not self.key:
                self.config_status = "invalid"
                self.status_detail = (
                    "Supabase service-role credentials are missing. "
                    "Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY to a service-role JWT or sb_secret key."
                )
                logger.warning(self.status_detail)
            else:
                self.config_status = "invalid"
                self.status_detail = (
                    "Supabase service-role credentials are malformed. "
                    "Use a full service-role JWT or an sb_secret key in SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY."
                )
                logger.warning(self.status_detail)

    def __getattr__(self, name: str):
        """Proxy unknown attributes to the underlying Supabase client when available."""
        client = self.__dict__.get("client")
        if client is not None and hasattr(client, name):
            return getattr(client, name)
        raise AttributeError(f"{self.__class__.__name__!s} has no attribute {name!r}")

    def table(self, table_name: str):
        """Return a Supabase query builder for the requested table."""
        if not self.client:
            raise RuntimeError("Supabase client is not configured.")
        return self.client.table(table_name)

    def _ensure_buckets_exist(self) -> None:
        """Ensure required storage buckets exist in Supabase."""
        if not self.client:
            return

        bucket_options = {
            self.bucket_name: {
                "public": True,
                "file_size_limit": MICROLEARNING_BUCKET_FILE_SIZE_LIMIT,
                "allowed_mime_types": MICROLEARNING_ALLOWED_MIME_TYPES,
            },
            self.profile_bucket_name: {
                "public": True,
                "file_size_limit": MICROLEARNING_BUCKET_FILE_SIZE_LIMIT,
                "allowed_mime_types": MICROLEARNING_ALLOWED_MIME_TYPES,
            },
            self.call_simulation_bucket_name: {
                "public": True,
                "file_size_limit": MICROLEARNING_BUCKET_FILE_SIZE_LIMIT,
                "allowed_mime_types": MICROLEARNING_ALLOWED_MIME_TYPES,
            },
            self.call_simulation_asset_bucket_name: {
                "public": True,
                "file_size_limit": MICROLEARNING_BUCKET_FILE_SIZE_LIMIT,
                "allowed_mime_types": MICROLEARNING_ALLOWED_MIME_TYPES,
            },
            self.microlearning_bucket_name: {
                "public": True,
                "file_size_limit": MICROLEARNING_BUCKET_FILE_SIZE_LIMIT,
                "allowed_mime_types": MICROLEARNING_ALLOWED_MIME_TYPES,
            },
        }

        try:
            # Get existing buckets
            existing_buckets = self.client.storage.list_buckets()
            existing_bucket_names = {bucket.name for bucket in existing_buckets}

            # Create missing buckets and keep existing bucket rules aligned with the app.
            for bucket_name, options in bucket_options.items():
                if bucket_name not in existing_bucket_names:
                    try:
                        self.client.storage.create_bucket(
                            bucket_name,
                            options=options,
                        )
                        logger.info(f"Created Supabase storage bucket: {bucket_name}")
                    except Exception as e:
                        logger.warning(f"Failed to create bucket {bucket_name}: {e}")
                    continue

                try:
                    self.client.storage.update_bucket(bucket_name, options)
                except Exception as e:
                    logger.warning(f"Failed to update bucket {bucket_name}: {e}")
        except Exception as e:
            logger.warning(f"Failed to check/create Supabase buckets: {e}")

    def _normalize_microlearning_folder(self, folder: Optional[str]) -> str:
        normalized_folder = (folder or "assets").strip().replace("\\", "/").strip("/")
        if not normalized_folder:
            normalized_folder = "assets"
        if not normalized_folder.startswith(f"{MICROLEARNING_STORAGE_ROOT}/"):
            normalized_folder = f"{MICROLEARNING_STORAGE_ROOT}/{normalized_folder}"
        return normalized_folder

    def _write_local_media_copy(
        self,
        *,
        relative_path: str,
        file_data: bytes,
    ) -> Optional[str]:
        """Persist a media file under the backend /media mount and return its public path."""
        normalized_relative_path = (relative_path or "").strip().replace("\\", "/").strip("/")
        if not normalized_relative_path:
            return None

        try:
            local_file_path = Path("media") / Path(*normalized_relative_path.split("/"))
            local_file_path.parent.mkdir(parents=True, exist_ok=True)
            local_file_path.write_bytes(file_data)
            logger.info("Saved local media fallback: %s", local_file_path)
            return f"/media/{normalized_relative_path}"
        except Exception as exc:
            logger.error("Failed to save local media fallback %s: %s", normalized_relative_path, exc)
            return None

    def _to_public_media_url(self, local_url: Optional[str]) -> Optional[str]:
        normalized_local_url = (local_url or "").strip()
        if not normalized_local_url:
            return None

        if normalized_local_url.startswith(("http://", "https://")):
            return normalized_local_url

        backend_base_url = normalize_env_value(os.getenv("BACKEND_URL")) or "http://127.0.0.1:8000"
        try:
            parsed = urlparse(backend_base_url)
            if parsed.scheme in {"http", "https"} and parsed.netloc:
                backend_base_url = f"{parsed.scheme}://{parsed.netloc}"
            else:
                backend_base_url = "http://127.0.0.1:8000"
        except Exception:
            backend_base_url = "http://127.0.0.1:8000"

        if not normalized_local_url.startswith("/"):
            normalized_local_url = f"/{normalized_local_url}"

        return f"{backend_base_url.rstrip('/')}{normalized_local_url}"

    def _allow_local_media_fallback(self) -> bool:
        explicit_value = normalize_env_value(os.getenv("ALLOW_LOCAL_MEDIA_FALLBACK")).lower()
        if explicit_value in {"1", "true", "yes", "on"}:
            return True
        if explicit_value in {"0", "false", "no", "off"}:
            return False

        backend_base_url = normalize_env_value(os.getenv("BACKEND_URL"))
        if not backend_base_url:
            return True

        try:
            parsed = urlparse(backend_base_url)
        except Exception:
            return True

        return (parsed.hostname or "").strip().lower() in {"127.0.0.1", "localhost", "0.0.0.0"}

    def _build_upload_file_options(
        self,
        *,
        content_type: Optional[str],
        upsert: bool = False,
    ) -> Dict[str, str]:
        options: Dict[str, str] = {
            "content-type": content_type or "application/octet-stream",
        }
        if upsert:
            options["upsert"] = "true"
            options["x-upsert"] = "true"
        return options

    def _upload_bytes_to_bucket(
        self,
        *,
        bucket_name: str,
        path: str,
        file_data: bytes,
        content_type: Optional[str] = None,
        upsert: bool = False,
    ) -> Optional[str]:
        if not self.is_available or not self.client:
            return None

        normalized_bucket = (bucket_name or "").strip()
        normalized_path = (path or "").strip().replace("\\", "/").lstrip("/")
        if not normalized_bucket or not normalized_path:
            return None

        file_options = self._build_upload_file_options(
            content_type=content_type,
            upsert=upsert,
        )

        last_error: Optional[Exception] = None
        for attempt in range(2):
            try:
                self.client.storage.from_(normalized_bucket).upload(
                    path=normalized_path,
                    file=file_data,
                    file_options=file_options,
                )
                public_url = self.client.storage.from_(normalized_bucket).get_public_url(normalized_path)
                logger.info("Uploaded file to %s: %s", normalized_bucket, normalized_path)
                return public_url
            except Exception as exc:
                last_error = exc
                if attempt == 0:
                    logger.warning(
                        "Supabase upload to %s/%s failed on first attempt: %s. Rechecking buckets and retrying once.",
                        normalized_bucket,
                        normalized_path,
                        exc,
                    )
                    try:
                        self._ensure_buckets_exist()
                    except Exception:
                        logger.warning("Bucket recheck failed during upload retry.", exc_info=True)
                    continue

        if last_error:
            logger.error(
                "Failed to upload file to %s/%s after retry: %s",
                normalized_bucket,
                normalized_path,
                last_error,
            )
        return None

    def create_signed_storage_url(
        self,
        *,
        bucket_name: str,
        path: str,
        expires_in: int = 3600,
    ) -> Optional[str]:
        if not self.is_available or not self.client:
            return None

        normalized_bucket = (bucket_name or "").strip()
        normalized_path = (path or "").strip().replace("\\", "/").lstrip("/")
        if not normalized_bucket or not normalized_path:
            return None

        try:
            result = self.client.storage.from_(normalized_bucket).create_signed_url(
                normalized_path,
                expires_in,
            )
            return result.get("signedURL") or result.get("signedUrl")
        except Exception as exc:
            logger.warning(
                "Failed to create signed URL for %s/%s: %s",
                normalized_bucket,
                normalized_path,
                exc,
            )
            return None

    def _delete_local_media_copy(self, public_url: str) -> bool:
        normalized_url = (public_url or "").strip()
        if not normalized_url:
            return False

        try:
            parsed = urlparse(normalized_url)
            local_path = parsed.path if parsed.scheme in {"http", "https"} else normalized_url
            normalized_local_path = unquote(local_path).replace("\\", "/").strip()
            if not normalized_local_path.startswith("/media/"):
                return False

            relative_path = normalized_local_path.split("/media/", 1)[1].strip("/")
            if not relative_path:
                return False

            media_root = Path("media").resolve()
            target_path = (media_root / Path(*relative_path.split("/"))).resolve()
            try:
                target_path.relative_to(media_root)
            except ValueError:
                logger.warning("Rejected local media deletion outside media root: %s", target_path)
                return False

            if target_path.exists():
                target_path.unlink()
                logger.info("Deleted local media fallback: %s", target_path)

            parent = target_path.parent
            while parent != media_root and parent.exists():
                try:
                    parent.rmdir()
                except OSError:
                    break
                parent = parent.parent

            return True
        except Exception as exc:
            logger.error("Failed to delete local media fallback %s: %s", normalized_url, exc)
            return False

    def upload_audio(
        self,
        file_data: bytes,
        user_id: str,
        filename: Optional[str] = None,
        content_type: Optional[str] = None,
    ) -> Optional[str]:
        """
        Upload audio file to Supabase storage bucket
        
        Args:
            file_data: Audio file bytes
            user_id: User ID for organization
            filename: Optional custom filename. If not provided, generates one with timestamp
        
        Returns:
            Public URL of uploaded file, or None if upload fails
        """
        if not self.is_available:
            logger.warning("Supabase not available. Audio file not uploaded to cloud.")
            return None

        try:
            if not filename:
                timestamp = datetime.utcnow().isoformat().replace(":", "-")
                filename = f"{user_id}/{timestamp}.wav"

            # Upload to bucket
            path = f"assessments/{filename}"
            response = self.client.storage.from_(self.bucket_name).upload(
                path=path,
                file=file_data,
                file_options={"content-type": content_type or "audio/wav"},
            )

            # Generate public URL
            public_url = self.client.storage.from_(self.bucket_name).get_public_url(path)

            logger.info(f"Audio file uploaded: {path}")
            return public_url

        except Exception as e:
            logger.error(f"Failed to upload audio file: {e}")
            return None

    def upload_call_simulation_audio(
        self,
        *,
        file_data: bytes,
        trainee_id: str,
        scenario_id: str,
        session_id: str,
        filename: str,
        content_type: Optional[str] = None,
    ) -> Optional[str]:
        """Upload a Call Simulation recording using the recordings/{trainee}/{scenario}/... layout."""
        local_url = self._write_local_media_copy(
            relative_path=f"call-simulation-recordings/{trainee_id}/{scenario_id}/{session_id}/{filename}",
            file_data=file_data,
        )

        if not self.is_available:
            logger.warning("Supabase not available. Using local fallback for Call Simulation audio.")
            return local_url

        try:
            path = f"recordings/{trainee_id}/{scenario_id}/{session_id}/{filename}"
            self.client.storage.from_(self.call_simulation_bucket_name).upload(
                path=path,
                file=file_data,
                file_options={"content-type": content_type or "audio/webm"},
            )
            public_url = self.client.storage.from_(self.call_simulation_bucket_name).get_public_url(path)
            logger.info(f"Call Simulation audio uploaded: {path}")
            return public_url
        except Exception as e:
            logger.error(f"Failed to upload Call Simulation audio file: {e}")
            return local_url

    def upload_sim_floor_audio(
        self,
        *,
        file_data: bytes,
        trainee_id: str,
        scenario_id: str,
        session_id: str,
        filename: str,
        content_type: Optional[str] = None,
    ) -> Optional[str]:
        """Backward-compatible alias for retired Call Simulation upload call sites."""
        return self.upload_call_simulation_audio(
            file_data=file_data,
            trainee_id=trainee_id,
            scenario_id=scenario_id,
            session_id=session_id,
            filename=filename,
            content_type=content_type,
        )

    def upload_call_simulation_asset(
        self,
        *,
        file_data: bytes,
        trainer_id: str,
        asset_kind: str,
        filename: str,
        scenario_id: Optional[str] = None,
        content_type: Optional[str] = None,
    ) -> Optional[str]:
        """Upload trainer-managed Call Simulation audio assets such as member turns and call tones."""
        scenario_segment = scenario_id or "draft"
        local_url = self._write_local_media_copy(
            relative_path=f"practice-audio/{trainer_id}/{scenario_segment}/{asset_kind}/{filename}",
            file_data=file_data,
        )

        if not self.is_available:
            logger.warning("Supabase not available. Using local fallback for Call Simulation asset upload.")
            return local_url

        try:
            path = f"assets/{trainer_id}/{scenario_segment}/{asset_kind}/{filename}"
            self.client.storage.from_(self.call_simulation_asset_bucket_name).upload(
                path=path,
                file=file_data,
                file_options={"content-type": content_type or "audio/mpeg"},
            )
            public_url = self.client.storage.from_(self.call_simulation_asset_bucket_name).get_public_url(path)
            logger.info(f"Call Simulation asset uploaded: {path}")
            return public_url
        except Exception as e:
            logger.error(f"Failed to upload Call Simulation asset: {e}")
            return local_url

    def upload_document(
        self,
        file_data: bytes,
        document_type: str,
        filename: Optional[str] = None,
    ) -> Optional[str]:
        """
        Upload document (PDF, etc.) to Supabase storage
        
        Args:
            file_data: Document file bytes
            document_type: Type of document (pdf, excel, report, etc.)
            filename: Optional custom filename
        
        Returns:
            Public URL of uploaded file, or None if upload fails
        """
        if not self.is_available:
            logger.warning("Supabase not available. Document not uploaded to cloud.")
            return None

        try:
            if not filename:
                timestamp = datetime.utcnow().isoformat().replace(":", "-")
                filename = f"{timestamp}.pdf" if document_type == "pdf" else f"{timestamp}.xlsx"

            # Determine content type
            content_types = {
                "pdf": "application/pdf",
                "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "xls": "application/vnd.ms-excel",
            }
            content_type = content_types.get(document_type, "application/octet-stream")

            path = f"documents/{document_type}/{filename}"
            response = self.client.storage.from_(self.bucket_name).upload(
                path=path,
                file=file_data,
                file_options={"content-type": content_type},
            )

            public_url = self.client.storage.from_(self.bucket_name).get_public_url(path)

            logger.info(f"Document uploaded: {path}")
            return public_url

        except Exception as e:
            logger.error(f"Failed to upload document: {e}")
            return None

    def upload_profile_image(
        self,
        file_data: bytes,
        user_id: str,
        filename: str,
        content_type: str,
    ) -> Optional[str]:
        """Upload a user profile image to Supabase storage."""
        path = f"profiles/{user_id}/{filename}"

        if self.is_available:
            public_url = self._upload_bytes_to_bucket(
                bucket_name=self.profile_bucket_name,
                path=path,
                file_data=file_data,
                content_type=content_type,
                upsert=True,
            )
            if public_url:
                return public_url

        if self._allow_local_media_fallback():
            logger.warning("Using local fallback for profile image upload: %s", path)
            return self._to_public_media_url(
                self._write_local_media_copy(
                    relative_path=path,
                    file_data=file_data,
                )
            )

        logger.error("Profile image upload failed and local fallback is disabled: %s", path)
        return None

    def upload_microlearning_audio(
        self,
        file_data: bytes,
        module_id: str,
        trainer_id: str,
        filename: Optional[str] = None,
        content_type: Optional[str] = None,
    ) -> Optional[str]:
        """
        Upload microlearning lesson audio to Supabase storage.
        
        Args:
            file_data: Audio file bytes
            module_id: Microlearning module ID for organization
            trainer_id: Trainer ID for ownership tracking
            filename: Optional custom filename. If not provided, generates one with timestamp
            content_type: MIME type for the uploaded lesson audio
        
        Returns:
            Public URL of uploaded file, or None if upload fails
        """
        if not self.is_available:
            logger.warning("Supabase not available. Microlearning audio not uploaded to cloud.")
            return None

        if not filename:
            timestamp = datetime.utcnow().isoformat().replace(":", "-")
            ext = "mp3" if (content_type or "").startswith("audio/mpeg") else "wav"
            filename = f"{module_id}/{timestamp}.{ext}"

        path = f"{MICROLEARNING_STORAGE_ROOT}/audio/{trainer_id}/{filename}"
        return self._upload_bytes_to_bucket(
            bucket_name=self.microlearning_bucket_name,
            path=path,
            file_data=file_data,
            content_type=content_type or "audio/mpeg",
        )

    def upload_microlearning_tts(
        self,
        audio_data: bytes,
        module_id: str,
        filename: Optional[str] = None,
    ) -> Optional[str]:
        """
        Upload text-to-speech generated audio for accessibility.
        
        Args:
            audio_data: TTS audio bytes (WAV format)
            module_id: Microlearning module ID
            filename: Optional custom filename
        
        Returns:
            Public URL of uploaded TTS audio, or None if upload fails
        """
        if not self.is_available:
            logger.warning("Supabase not available. TTS audio not uploaded to cloud.")
            return None

        if not filename:
            timestamp = datetime.utcnow().isoformat().replace(":", "-")
            filename = f"{module_id}/tts_{timestamp}.wav"

        path = f"{MICROLEARNING_STORAGE_ROOT}/tts/{filename}"
        return self._upload_bytes_to_bucket(
            bucket_name=self.microlearning_bucket_name,
            path=path,
            file_data=audio_data,
            content_type="audio/wav",
        )

    def upload_microlearning_binary(
        self,
        *,
        module_id: str,
        trainer_id: str,
        filename: str,
        file_data: bytes,
        content_type: Optional[str] = None,
        folder: str = "assets",
    ) -> Optional[str]:
        """Upload an arbitrary microlearning companion file such as captions."""
        sanitized_folder = self._normalize_microlearning_folder(folder)
        path = f"{sanitized_folder}/{trainer_id}/{module_id}/{filename}"

        if self.is_available:
            public_url = self._upload_bytes_to_bucket(
                bucket_name=self.microlearning_bucket_name,
                path=path,
                file_data=file_data,
                content_type=content_type or "application/octet-stream",
                upsert=True,
            )
            if public_url:
                return public_url

        if self._allow_local_media_fallback():
            logger.warning(
                "Using local fallback for microlearning companion file upload: %s",
                path,
            )
            return self._to_public_media_url(
                self._write_local_media_copy(
                    relative_path=path,
                    file_data=file_data,
                )
            )

        logger.error(
            "Microlearning companion file upload failed and local fallback is disabled: %s",
            path,
        )
        return None

    def upload_binary(
        self,
        *,
        path: str,
        file_data: bytes,
        content_type: Optional[str] = None,
        upsert: bool = False,
    ) -> Optional[str]:
        """Upload arbitrary binary content to Supabase storage and return a public URL."""
        if not self.is_available:
            logger.warning("Supabase not available. Binary upload skipped.")
            return None

        normalized_path = (path or "").strip().lstrip("/")
        if not normalized_path:
            logger.warning("Supabase upload path is required for binary upload.")
            return None

        return self._upload_bytes_to_bucket(
            bucket_name=self.bucket_name,
            path=normalized_path,
            file_data=file_data,
            content_type=content_type or "application/octet-stream",
            upsert=upsert,
        )

    def delete_storage_object(
        self,
        *,
        bucket_name: str,
        path: str,
    ) -> bool:
        """Delete a specific object from a Supabase storage bucket."""
        if not self.is_available or not self.client:
            return False

        normalized_bucket = (bucket_name or "").strip()
        normalized_path = (path or "").strip().lstrip("/")
        if not normalized_bucket or not normalized_path:
            return False

        try:
            self.client.storage.from_(normalized_bucket).remove([normalized_path])
            logger.info(f"File deleted from {normalized_bucket}: {normalized_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete storage object {normalized_bucket}/{normalized_path}: {e}")
            return False

    def delete_file(self, file_path: str) -> bool:
        """
        Delete file from Supabase storage
        
        Args:
            file_path: Path to file in bucket (e.g., "assessments/user123/timestamp.wav")
        
        Returns:
            True if deletion successful, False otherwise
        """
        if not self.is_available:
            return False

        try:
            self.client.storage.from_(self.bucket_name).remove([file_path])
            logger.info(f"File deleted: {file_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete file: {e}")
            return False

    def delete_by_public_url(self, public_url: str) -> bool:
        """Delete a public Supabase storage file when the bucket path can be derived."""
        if not public_url:
            return False

        if self._delete_local_media_copy(public_url):
            return True

        if not self.is_available or not self.client:
            return False

        try:
            parsed = urlparse(public_url)
            bucket_names = [
                self.bucket_name,
                self.profile_bucket_name,
                self.call_simulation_bucket_name,
                self.call_simulation_asset_bucket_name,
                self.microlearning_bucket_name,
            ]

            for bucket_name in bucket_names:
                marker = f"/storage/v1/object/public/{bucket_name}/"
                if marker not in parsed.path:
                    continue

                path = parsed.path.split(marker, 1)[1]
                if not path:
                    return False

                self.client.storage.from_(bucket_name).remove([path])
                logger.info(f"File deleted from {bucket_name}: {path}")
                return True

            return False
        except Exception as e:
            logger.error(f"Failed to delete public Supabase file: {e}")
            return False

    def list_user_files(self, user_id: str) -> list:
        """
        List all files for a specific user
        
        Args:
            user_id: User ID to list files for
        
        Returns:
            List of file objects with metadata
        """
        if not self.is_available:
            return []

        try:
            files = self.client.storage.from_(self.bucket_name).list(
                path=f"assessments/{user_id}"
            )
            return files
        except Exception as e:
            logger.error(f"Failed to list user files: {e}")
            return []


# Singleton instance
_supabase_client: Optional[SupabaseClient] = None


def get_supabase_client() -> SupabaseClient:
    """Get or initialize the Supabase client singleton"""
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = SupabaseClient()
    return _supabase_client
