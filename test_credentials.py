import base64
import json

# Test the provided credentials
anon_key = "FpZAH6eNpKimLi4jLNHMCA_T_aHAICt"
service_key = "wmEKFIHJ1ktdCe6dQNjW6A_GJKTyLDX"

print("Testing Anon Key...")
print(f"  Input: {anon_key}")
token = anon_key
padding = 4 - (len(token) % 4)
if padding != 4:
    token += '=' * padding
try:
    decoded = base64.urlsafe_b64decode(token)
    payload = json.loads(decoded)
    print(f"  ✓ Valid JWT - Project ref: {payload.get('ref', 'NOT FOUND')}")
except Exception as e:
    print(f"  ✗ INVALID - {e}")

print("\nTesting Service Key...")
print(f"  Input: {service_key}")
token = service_key
padding = 4 - (len(token) % 4)
if padding != 4:
    token += '=' * padding
try:
    decoded = base64.urlsafe_b64decode(token)
    payload = json.loads(decoded)
    print(f"  ✓ Valid JWT - Project ref: {payload.get('ref', 'NOT FOUND')}")
except Exception as e:
    print(f"  ✗ INVALID - {e}")
