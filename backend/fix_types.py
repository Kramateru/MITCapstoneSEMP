import re

files_to_fix = [
    'routes/trainee_routes.py',
    'routes/trainer_routes.py', 
    'routes/admin_routes.py',
    'routes/settings_routes.py',
    'routes/workspace_routes.py',
]

for filepath in files_to_fix:
    try:
        with open(filepath, 'r') as f:
            content = f.read()
        
        # Replace current_user: User = Depends with Any version
        pattern = r'current_user: User = Depends'
        replacement = 'current_user: Any = Depends'
        new_content = re.sub(pattern, replacement, content)
        
        if new_content != content:
            with open(filepath, 'w') as f:
                f.write(new_content)
            print(f'Updated {filepath}')
        else:
            print(f'No changes needed in {filepath}')
    except Exception as e:
        print(f'Error processing {filepath}: {e}')

print('Done!')
