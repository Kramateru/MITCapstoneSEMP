"""
Supabase client module for managing cloud storage and database operations
- File uploads to bucket
- Public URL generation
- Assessment data storage
"""

import os
import logging
from typing import Optional, Dict, Any
from datetime import datetime

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
        self.url = os.getenv("SUPABASE_URL")
        self.key = os.getenv("SUPABASE_SERVICE_KEY")
        self.bucket_name = os.getenv("STORAGE_BUCKET_NAME", "audio-records")
        self.is_available = False

        if SUPABASE_AVAILABLE and self.url and self.key:
            try:
                self.client = create_client(self.url, self.key)
                self.is_available = True
                logger.info("✓ Supabase client initialized successfully")
            except Exception as e:
                logger.warning(f"Failed to initialize Supabase: {e}")
        else:
            if not SUPABASE_AVAILABLE:
                logger.info("Supabase library not available. Install with: pip install supabase")
            elif not self.url or not self.key:
                logger.info("Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY")

    def upload_audio(
        self,
        file_data: bytes,
        user_id: str,
        filename: Optional[str] = None,
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
                file_options={"content-type": "audio/wav"},
            )

            # Generate public URL
            public_url = self.client.storage.from_(self.bucket_name).get_public_url(path)

            logger.info(f"✓ Audio file uploaded: {path}")
            return public_url

        except Exception as e:
            logger.error(f"Failed to upload audio file: {e}")
            return None

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

            logger.info(f"✓ Document uploaded: {path}")
            return public_url

        except Exception as e:
            logger.error(f"Failed to upload document: {e}")
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
            logger.info(f"✓ File deleted: {file_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete file: {e}")
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
