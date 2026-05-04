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
from urllib.parse import urlparse

from .config_validation import (
    classify_supabase_api_key,
    is_usable_supabase_service_key,
    is_usable_supabase_url,
    normalize_env_value,
)

logger = logging.getLogger(__name__)

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
        self.url = normalize_env_value(
            os.getenv("SUPABASE_URL")
            or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
            or os.getenv("REACT_APP_SUPABASE_URL")
        )
        self.key = normalize_env_value(
            os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            or os.getenv("SUPABASE_SERVICE_KEY")
            or os.getenv("SUPABASE_KEY")
            or os.getenv("SUPABASE_SERVICE_ROLE")
        )
        self.bucket_name = os.getenv("STORAGE_BUCKET_NAME", "audio-records")
        self.call_simulation_bucket_name = os.getenv(
            "CALL_SIMULATION_STORAGE_BUCKET_NAME", "call-simulation-audio"
        )
        # New bucket for microlearning audio content
        self.microlearning_bucket_name = os.getenv(
            "MICROLEARNING_STORAGE_BUCKET_NAME", "audio-modules"
        )
        self.is_available = False
        self.config_status = "not_configured"
        self.status_detail = (
            "Supabase service credentials are not configured. "
            "Set SUPABASE_URL and SUPABASE_SERVICE_KEY to enable storage features."
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
                    "SUPABASE_SERVICE_KEY is missing. Use a service-role JWT or an sb_secret key."
                )
                logger.warning(self.status_detail)
            else:
                self.config_status = "invalid"
                self.status_detail = (
                    "SUPABASE_SERVICE_KEY is malformed. Use a full service-role JWT or an sb_secret key."
                )
                logger.warning(self.status_detail)

    def _ensure_buckets_exist(self) -> None:
        """Ensure required storage buckets exist in Supabase."""
        if not self.client:
            return
            
        buckets_to_check = [
            self.bucket_name,
            self.call_simulation_bucket_name,
            self.microlearning_bucket_name,
        ]
        
        try:
            # Get existing buckets
            existing_buckets = self.client.storage.list_buckets()
            existing_bucket_names = {bucket.name for bucket in existing_buckets}
            
            # Create missing buckets
            for bucket_name in buckets_to_check:
                if bucket_name not in existing_bucket_names:
                    try:
                        self.client.storage.create_bucket(
                            bucket_name,
                            options={
                                "public": True,
                                "file_size_limit": 50 * 1024 * 1024,  # 50MB limit
                                "allowed_mime_types": ["audio/*", "application/pdf", "text/*"]
                            }
                        )
                        logger.info(f"Created Supabase storage bucket: {bucket_name}")
                    except Exception as e:
                        logger.warning(f"Failed to create bucket {bucket_name}: {e}")
        except Exception as e:
            logger.warning(f"Failed to check/create Supabase buckets: {e}")

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
            self.client.storage.from_(self.call_simulation_bucket_name).upload(
                path=path,
                file=file_data,
                file_options={"content-type": content_type or "audio/mpeg"},
            )
            public_url = self.client.storage.from_(self.call_simulation_bucket_name).get_public_url(path)
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
        if not self.is_available:
            logger.warning("Supabase not available. Profile image not uploaded to cloud.")
            return None

        try:
            path = f"profiles/{user_id}/{filename}"
            self.client.storage.from_(self.bucket_name).upload(
                path=path,
                file=file_data,
                file_options={
                    "content-type": content_type,
                    "upsert": "true",
                },
            )
            public_url = self.client.storage.from_(self.bucket_name).get_public_url(path)
            logger.info(f"Profile image uploaded: {path}")
            return public_url
        except Exception as e:
            logger.error(f"Failed to upload profile image: {e}")
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
        Upload microlearning audio file (MP3/WAV) to Supabase storage.
        
        Args:
            file_data: Audio file bytes
            module_id: Microlearning module ID for organization
            trainer_id: Trainer ID for ownership tracking
            filename: Optional custom filename. If not provided, generates one with timestamp
            content_type: MIME type (defaults to audio/mpeg for MP3)
        
        Returns:
            Public URL of uploaded file, or None if upload fails
        """
        if not self.is_available:
            logger.warning("Supabase not available. Microlearning audio not uploaded to cloud.")
            return None

        try:
            if not filename:
                timestamp = datetime.utcnow().isoformat().replace(":", "-")
                ext = "mp3" if (content_type or "").startswith("audio/mpeg") else "wav"
                filename = f"{module_id}/{timestamp}.{ext}"

            # Upload to microlearning-audio bucket
            path = f"audio/{trainer_id}/{filename}"
            self.client.storage.from_(self.microlearning_bucket_name).upload(
                path=path,
                file=file_data,
                file_options={"content-type": content_type or "audio/mpeg"},
            )

            public_url = self.client.storage.from_(self.microlearning_bucket_name).get_public_url(path)
            logger.info(f"Microlearning audio uploaded: {path}")
            return public_url

        except Exception as e:
            logger.error(f"Failed to upload microlearning audio: {e}")
            return None

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

        try:
            if not filename:
                timestamp = datetime.utcnow().isoformat().replace(":", "-")
                filename = f"{module_id}/tts_{timestamp}.wav"

            path = f"tts/{filename}"
            self.client.storage.from_(self.microlearning_bucket_name).upload(
                path=path,
                file=audio_data,
                file_options={"content-type": "audio/wav"},
            )

            public_url = self.client.storage.from_(self.microlearning_bucket_name).get_public_url(path)
            logger.info(f"TTS audio uploaded: {path}")
            return public_url

        except Exception as e:
            logger.error(f"Failed to upload TTS audio: {e}")
            return None

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
        if not self.is_available:
            logger.warning("Supabase not available. Microlearning companion file not uploaded to cloud.")
            return None

        try:
            sanitized_folder = (folder or "assets").strip("/ ") or "assets"
            path = f"{sanitized_folder}/{trainer_id}/{module_id}/{filename}"
            self.client.storage.from_(self.microlearning_bucket_name).upload(
                path=path,
                file=file_data,
                file_options={
                    "content-type": content_type or "application/octet-stream",
                    "upsert": "true",
                },
            )
            public_url = self.client.storage.from_(self.microlearning_bucket_name).get_public_url(path)
            logger.info(f"Microlearning companion file uploaded: {path}")
            return public_url
        except Exception as e:
            logger.error(f"Failed to upload microlearning companion file: {e}")
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

        try:
            self.client.storage.from_(self.bucket_name).upload(
                path=normalized_path,
                file=file_data,
                file_options={
                    "content-type": content_type or "application/octet-stream",
                    "upsert": "true" if upsert else "false",
                },
            )
            public_url = self.client.storage.from_(self.bucket_name).get_public_url(
                normalized_path
            )
            logger.info(f"Binary file uploaded: {normalized_path}")
            return public_url
        except Exception as e:
            logger.error(f"Failed to upload binary file: {e}")
            return None

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
        if not self.is_available or not public_url:
            return False

        try:
            parsed = urlparse(public_url)
            bucket_names = [
                self.bucket_name,
                self.call_simulation_bucket_name,
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
