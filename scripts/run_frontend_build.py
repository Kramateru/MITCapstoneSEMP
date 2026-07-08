import subprocess
import os
frontend_dir = r"c:\Users\Mark Ureta\Documents\MIT CAPSTONE\SYSTEM\SYSTEM - Speech Enabled BPO Platform\frontend"
print('cwd:', os.getcwd())
print('frontend_dir:', frontend_dir)
print('npm path:')
print(subprocess.run(['where', 'npm'], capture_output=True, text=True).stdout)
result = subprocess.run(['npm.cmd', 'run', 'build'], cwd=frontend_dir, capture_output=True, text=True)
print('returncode:', result.returncode)
print('stdout:')
print(result.stdout)
print('stderr:')
print(result.stderr)
