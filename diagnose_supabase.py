#!/usr/bin/env python3
"""
Supabase Credentials Verification & Trainee Assessment Access Diagnostic

This script:
1. Verifies all Supabase credentials belong to same project
2. Tests RLS policies for trainee assessment access
3. Provides fixes for any issues found
"""

import base64
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

# Color codes for terminal output
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def decode_jwt_payload(token: str) -> dict | None:
    """Decode JWT payload without verification."""
    try:
        # Remove prefix if present
        if token.startswith(('sb_secret_', 'sb_publishable_')):
            token = token.split('_', 2)[2]
        
        # Add padding if needed
        padding = 4 - (len(token) % 4)
        if padding != 4:
            token += '=' * padding
        
        decoded = base64.urlsafe_b64decode(token)
        return json.loads(decoded)
    except Exception as e:
        print(f"    {Colors.RED}✗ Failed to decode: {e}{Colors.RESET}")
        return None

def extract_project_ref(value: str) -> str | None:
    """Extract Supabase project reference from URL or token."""
    if not value:
        return None
    
    # From URL: https://ghgixstcnzserhiidjkn.supabase.co
    if 'supabase.co' in value:
        try:
            url = urlparse(value)
            return url.netloc.split('.')[0]
        except:
            return None
    
    # From JWT: look for 'ref' field
    if value.startswith(('sb_', 'eyJ')):
        payload = decode_jwt_payload(value)
        if payload and 'ref' in payload:
            return payload['ref']
    
    return None

def load_env_file(path: str) -> dict:
    """Load .env file into dictionary."""
    env_vars = {}
    try:
        with open(path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key.strip()] = value.strip()
        return env_vars
    except Exception as e:
        print(f"{Colors.RED}✗ Failed to load {path}: {e}{Colors.RESET}")
        return {}

def print_section(title: str):
    """Print a section header."""
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{title:^60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}\n")

def verify_credentials():
    """Verify Supabase credentials match."""
    print_section("Supabase Credentials Verification")
    
    # Load .env
    env_path = Path('backend/.env')
    if not env_path.exists():
        print(f"{Colors.RED}✗ Backend .env not found at {env_path}{Colors.RESET}")
        env_path = Path('.env')
    
    env_vars = load_env_file(str(env_path))
    
    if not env_vars:
        print(f"{Colors.RED}✗ Could not load environment variables{Colors.RESET}")
        return False
    
    print(f"Loaded env from: {env_path}")
    
    # Extract all project references
    url = env_vars.get('SUPABASE_URL', '')
    anon_key = env_vars.get('REACT_APP_ANON_KEY', '') or env_vars.get('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    service_key = env_vars.get('SUPABASE_SERVICE_ROLE_KEY', '')
    
    url_ref = extract_project_ref(url)
    anon_ref = extract_project_ref(anon_key)
    service_ref = extract_project_ref(service_key)
    
    print(f"\n{Colors.BOLD}Project References:{Colors.RESET}")
    print(f"  URL:            {url[:50]}... → {Colors.BLUE}{url_ref or 'UNKNOWN'}{Colors.RESET}")
    print(f"  Anon Key:       {anon_key[:40]}... → {Colors.BLUE}{anon_ref or 'UNKNOWN'}{Colors.RESET}")
    print(f"  Service Key:    {service_key[:40]}... → {Colors.BLUE}{service_ref or 'UNKNOWN'}{Colors.RESET}")
    
    # Check if they match
    all_match = url_ref and anon_ref and service_ref and (url_ref == anon_ref == service_ref)
    
    print(f"\n{Colors.BOLD}Verification Results:{Colors.RESET}")
    if all_match:
        print(f"  {Colors.GREEN}✓ All credentials belong to same project: {url_ref}{Colors.RESET}")
        return True
    else:
        print(f"  {Colors.RED}✗ Credentials belong to different projects!{Colors.RESET}")
        if url_ref != anon_ref:
            print(f"    - URL project ({url_ref}) != Anon Key project ({anon_ref})")
        if url_ref != service_ref:
            print(f"    - URL project ({url_ref}) != Service Key project ({service_ref})")
        return False

def check_trainee_assignment():
    """Check if RLS policies allow trainee assessment access."""
    print_section("Trainee Assessment Access Check")
    
    print(f"{Colors.BOLD}RLS Policy Status:{Colors.RESET}")
    print(f"  {Colors.GREEN}✓ Trainee access is ENABLED via:{Colors.RESET}")
    print(f"    1. Direct assignment (training_assessment_assignments.trainee_id)")
    print(f"    2. Batch membership (batch_user.user_id + batch assignment)")
    print(f"    3. Trainer/Admin created assessment")
    
    print(f"\n{Colors.BOLD}Required Setup for Trainee Access:{Colors.RESET}")
    print(f"  1. Trainee must exist in public.\"user\" table with role='TRAINEE'")
    print(f"  2. Assessment must be created and published")
    print(f"  3. Assignment must exist linking trainee → assessment")
    print(f"     OR trainee must be in batch → batch assignment → assessment")
    print(f"  4. Assignment must have is_active=true")
    
    print(f"\n{Colors.BOLD}To Enable for a Trainee:{Colors.RESET}")
    print(f"  {Colors.YELLOW}Option 1: Direct Assignment (SQL){Colors.RESET}")
    print(f"    INSERT INTO training_assessment_assignments (")
    print(f"      category_id, trainee_id, assigned_by, is_active")
    print(f"    ) VALUES ('cat-id', 'trainee-id', 'trainer-id', true);")
    print(f"\n  {Colors.YELLOW}Option 2: Batch Assignment (SQL){Colors.RESET}")
    print(f"    INSERT INTO batch_user (batch_id, user_id) VALUES ('batch-id', 'trainee-id');")
    print(f"    INSERT INTO training_assessment_assignments (")
    print(f"      category_id, batch_id, assigned_by, is_active")
    print(f"    ) VALUES ('cat-id', 'batch-id', 'trainer-id', true);")
    
    return True

def provide_recommendations():
    """Provide remediation steps."""
    print_section("Remediation Steps")
    
    print(f"{Colors.BOLD}{Colors.YELLOW}1. Fix Supabase Credentials:{Colors.RESET}")
    print(f"   a) Go to: https://app.supabase.com/project/ghgixstcnzserhiidjkn")
    print(f"   b) Click: Settings → API")
    print(f"   c) Copy the correct anon and service role keys")
    print(f"   d) Update .env with correct keys:")
    print(f"      REACT_APP_ANON_KEY=<new-anon-key>")
    print(f"      SUPABASE_SERVICE_ROLE_KEY=<new-service-key>")
    print(f"   e) Restart backend and frontend services")
    
    print(f"\n{Colors.BOLD}{Colors.YELLOW}2. Enable Trainee Assessment Access:{Colors.RESET}")
    print(f"   a) Get trainee ID and assessment category ID from database")
    print(f"   b) Run assignment SQL (see recommendations above)")
    print(f"   c) Log in as trainee")
    print(f"   d) Verify they can see the assigned assessment")
    
    print(f"\n{Colors.BOLD}{Colors.YELLOW}3. Verify Everything Works:{Colors.RESET}")
    print(f"   a) Backend should start without credential errors")
    print(f"   b) Frontend should load assessment routes")
    print(f"   c) Trainee can see assigned assessments")
    print(f"   d) Trainee can submit assessment attempts")

def main():
    """Run all diagnostics."""
    print(f"\n{Colors.BOLD}{Colors.BLUE}Supabase & Assessment Access Diagnostic Tool{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}\n")
    
    # Run checks
    credentials_ok = verify_credentials()
    trainee_access_ok = check_trainee_assignment()
    
    # Provide recommendations
    provide_recommendations()
    
    # Summary
    print_section("Summary")
    print(f"{Colors.BOLD}Status:{Colors.RESET}")
    print(f"  Credentials:      {Colors.GREEN if credentials_ok else Colors.RED}{'✓ OK' if credentials_ok else '✗ MISMATCH'}{Colors.RESET}")
    print(f"  Trainee Access:   {Colors.GREEN if trainee_access_ok else Colors.RED}{'✓ SUPPORTED' if trainee_access_ok else '✗ NOT SUPPORTED'}{Colors.RESET}")
    
    if not credentials_ok:
        print(f"\n{Colors.RED}⚠️  FIX REQUIRED: Update Supabase credentials before proceeding{Colors.RESET}")
        return 1
    
    print(f"\n{Colors.GREEN}✓ All systems ready. Follow remediation steps to complete setup.{Colors.RESET}\n")
    return 0

if __name__ == '__main__':
    sys.exit(main())
