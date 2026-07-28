"""
Simple test script to POST an audio file to the trainee ASR assess endpoint.
Usage:
  python scripts/test_assess_upload.py --file sample.wav --url http://127.0.0.1:8000 --module-id <moduleId> --trainer-id <trainerId> [--token <jwt>]

It prints the JSON response.
"""
import argparse
import mimetypes
import sys
from pathlib import Path

import requests


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--file', '-f', required=True, help='Path to audio file to upload')
    p.add_argument('--url', '-u', default='http://127.0.0.1:8000', help='Base backend URL')
    p.add_argument('--module-id', default=None, help='Module ID to store audio under')
    p.add_argument('--trainer-id', default=None, help='Trainer ID to store audio under')
    p.add_argument('--reference-text', default=None, help='Reference text for assessment')
    p.add_argument('--token', default=None, help='Bearer token for Authorization header')
    args = p.parse_args()

    file_path = Path(args.file)
    if not file_path.exists():
        print('File not found:', file_path)
        sys.exit(2)

    mime_type, _ = mimetypes.guess_type(str(file_path))
    mime_type = mime_type or 'application/octet-stream'

    endpoint = f"{args.url.rstrip('/')}/api/trainee/asr/assess"

    with open(file_path, 'rb') as fh:
        files = {
            'file': (file_path.name, fh, mime_type),
        }
        data = {}
        if args.module_id:
            data['module_id'] = args.module_id
        if args.trainer_id:
            data['trainer_id'] = args.trainer_id
        if args.reference_text:
            data['reference_text'] = args.reference_text

        headers = {}
        if args.token:
            headers['Authorization'] = f'Bearer {args.token}'

        print('Posting to', endpoint)
        resp = requests.post(endpoint, files=files, data=data, headers=headers)

    try:
        print('Status:', resp.status_code)
        print(resp.json())
    except Exception:
        print('Non-JSON response:')
        print(resp.text)


if __name__ == '__main__':
    main()
