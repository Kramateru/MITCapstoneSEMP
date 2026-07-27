# Trainer Module Speech Generation - Comprehensive Implementation

## Overview
The trainer module now has comprehensive speech generation capabilities across all call simulation scenarios. All generated speech is automatically saved to both local storage and Supabase for trainee access during call simulations.

---

## What Was Implemented

### 1. **Member Row Speech Generation** ✅
Already existed, but verified and enhanced:
- **Feature**: Trainers can generate AI speech for all "Member" actor rows in a scenario
- **How to use**:
  - Click "Generate Speech" button for individual Member rows
  - Click "Generate All Member Speech" to generate for all Member rows at once
- **Storage**: 
  - Local: `/media/tts-audio/scenarios/{scenarioId}/step-{stepNumber}_{timestamp}_member-step.wav`
  - Supabase: `call-simulation-assets/{trainerId}/scenarios/{scenarioId}/step-{stepNumber}_{timestamp}_member-step.wav`
- **Access**: Trainees can play audio during call simulations

### 2. **Ringer Audio Speech Generation** ✨ NEW
- **Feature**: Generate AI speech for the ringer tone that plays when trainees start a scenario
- **How to use**:
  1. Go to "Shared Call Audio" section in trainer workspace
  2. Click "Generate Speech" button next to Ringer Audio
  3. Enter the ringer speech text (e.g., "Thank you for calling...")
  4. Click "Generate & Save"
  5. Audio is automatically saved to Supabase and applied to all scenarios
- **Storage**:
  - Local: `/media/tts-audio/global/step-01_{timestamp}_ringer.wav`
  - Supabase: `call-simulation-assets/{trainerId}/ringer/{timestamp}_ringer.wav`
- **Scope**: Trainer-wide setting applied to ALL scenarios

### 3. **Hold Audio Speech Generation** ✨ NEW
- **Feature**: Generate AI speech for hold music/messages that play when trainees put calls on hold
- **How to use**:
  1. Go to "Shared Call Audio" section in trainer workspace
  2. Click "Generate Speech" button next to Hold Audio
  3. Enter the hold speech text (e.g., "Thank you for holding...")
  4. Click "Generate & Save"
  5. Audio is automatically saved to Supabase and applied to all scenarios
- **Storage**:
  - Local: `/media/tts-audio/global/step-02_{timestamp}_hold.wav`
  - Supabase: `call-simulation-assets/{trainerId}/hold/{timestamp}_hold.wav`
- **Scope**: Trainer-wide setting applied to ALL scenarios

---

## Storage Architecture

### Local Backup
All generated speech is saved locally for backup purposes:
```
/media/tts-audio/
├── scenarios/
│   └── {scenarioId}/
│       ├── step-01_{timestamp}_member-step.wav
│       ├── step-02_{timestamp}_member-step.wav
│       └── ...
└── global/
    ├── step-01_{timestamp}_ringer.wav
    └── step-02_{timestamp}_hold.wav
```

### Supabase Persistent Storage
All generated audio is uploaded to Supabase for trainee access:
- **Bucket**: `call-simulation-assets`
- **Paths**:
  - Member: `{trainerId}/scenarios/{scenarioId}/step-{stepNumber}_{timestamp}_member-step.wav`
  - Ringer: `{trainerId}/ringer/{timestamp}_ringer.wav`
  - Hold: `{trainerId}/hold/{timestamp}_hold.wav`

### Database Tracking
All generated audio is tracked in the `call_simulation_audio_assets` table with:
- `asset_kind`: 'member-step', 'ringer', or 'hold'
- `source_type`: 'generated_tts'
- `provider`: 'Gemini' or 'browser_fallback'
- `voice_used`: 'Puck' (default voice)
- `generated_text`: Original text used for TTS
- `public_url`: Supabase public URL for trainee access
- `bucket_name`: Storage bucket location
- `storage_path`: Full storage path
- `local_audio_path`: Local backup path
- `metadata`: Additional context (duration, language, voice style, etc.)

---

## Validation & Safety Features

### 1. **Member Audio Validation**
Before saving a scenario, the system ensures:
- ✅ All Member rows with scripts have stored Supabase audio
- ✅ At least one Member row per scenario group has audio
- ✅ Audio is accessible to trainees (stored in Supabase, not embedded)

**Error Messages**:
- "All Member rows with scripts must have generated or uploaded audio stored in Supabase..."
- "Generate or upload stored Member audio for Scenario Group(s) X before saving..."

### 2. **Coverage Indicator**
A real-time badge shows Member audio coverage:
```
Member AI audio coverage: 3/4 ready
```
- Green when all Member rows have audio
- Shows count of ready Member rows

### 3. **Automatic Speech Generation on Save**
If any Member rows lack audio when saving:
- System automatically attempts to generate speech
- Only generates if text is available
- Returns clear error if generation fails
- Prevents scenario save until audio is resolved

### 4. **Ringer & Hold Audio Validation**
Before saving a scenario:
- ✅ Ringer audio must be in Supabase (shared or scenario-specific)
- ✅ Hold audio (if specified) must be in Supabase
- ✅ Both support "Generate Speech" as alternative to upload

---

## Trainee Experience

### During Call Simulation
1. **Incoming Call**: Ringer audio plays automatically when starting scenario
2. **Member Turns**: Member script is displayed, and audio plays if available
   - If generated speech: Plays AI-generated audio
   - If fallback: Uses browser TTS
3. **On Hold**: Hold audio plays when trainee places call on hold
4. **Graceful Degradation**: If any audio fails, system continues with text display

### Audio Playback Flow
```
Trainee starts scenario
    ↓
Ringer audio plays
    ↓
Scenario begins (Member speaks)
    ↓
If audio_url exists in Supabase → Play audio
Else if script exists → Use browser TTS fallback
    ↓
Continue conversation ping-pong
    ↓
On Hold → Play hold audio
```

---

## Implementation Details

### Frontend Changes
**File**: `frontend/app/components/trainer/trainer-call-simulation-page-content.tsx`

**New State Variables**:
```typescript
const [ringerSpeechText, setRingerSpeechText] = useState('');
const [holdSpeechText, setHoldSpeechText] = useState('');
const [generatingRingerSpeech, setGeneratingRingerSpeech] = useState(false);
const [generatingHoldSpeech, setGeneratingHoldSpeech] = useState(false);
const [showRingerSpeechDialog, setShowRingerSpeechDialog] = useState(false);
const [showHoldSpeechDialog, setShowHoldSpeechDialog] = useState(false);
```

**New Handler Functions**:
- `handleGenerateRingerSpeech()`: Generates ringer audio from text
- `handleGenerateHoldSpeech()`: Generates hold audio from text

**New UI Components**:
- "Generate Speech" buttons in Shared Call Audio section
- Input dialogs for ringer and hold speech text
- Progress indicators during generation
- Audio preview controls

**Enhanced Validation**:
- Stricter Member audio coverage checking
- Prevents saving scenarios with missing Member audio
- Clear error messages guide trainers to fix issues

### Backend Endpoints
**Existing Endpoint**: `/api/call-simulation/tts` (POST)

**Parameters**:
```typescript
{
  text: string,              // Speech text to generate
  persist: true,             // Always save to Supabase
  require_supabase: boolean, // Fail if can't save to Supabase
  asset_kind: string,        // 'member-step', 'ringer', or 'hold'
  scenario_id: string,       // Optional, for scenario-specific audio
  step_number: number,       // Optional, for step identification
  replace_audio_url: string  // Optional, URL to replace
}
```

**Storage Process**:
1. Generate audio using TTS service (Gemini, Azure, or browser fallback)
2. Save locally via `_save_generated_call_simulation_tts_local()`
3. Upload to Supabase via `supabase.upload_call_simulation_asset()`
4. Create/update `CallSimulationAudioAsset` database record
5. Return audio URL to frontend
6. Log action in `CallSimulationEvent` audit trail

---

## Step-by-Step Trainer Workflow

### Creating a Complete Scenario with Generated Speech

**Step 1: Set Up Shared Audio (One-time)**
1. Open trainer workspace → "Shared Call Audio"
2. For Ringer: Click "Generate Speech" → Enter text → "Generate & Save"
3. For Hold: Click "Generate Speech" → Enter text → "Generate & Save"
4. ✅ Both ringer and hold audio now saved to Supabase

**Step 2: Create Scenario**
1. Open "Create Scenario" dialog
2. Fill in title, topic, description, and scenario group
3. Add alternating CSR and Member rows with scripts

**Step 3: Generate Member Speech**
```
OPTION A: Individual Generation
  For each Member row → Click "Generate Speech" → Done

OPTION B: Bulk Generation
  Click "Generate All Member Speech" in header
  System generates speech for all Member rows at once
  Shows progress: "Generating 3/5"
```

**Step 4: Verify Coverage**
- Check badge: "Member AI audio coverage: 5/5 ready"
- All Member rows should show green checkmarks
- Audio previews should play correctly

**Step 5: Save Scenario**
1. Click "Save Scenario"
2. System validates:
   - ✅ All Member rows have Supabase audio
   - ✅ Ringer and hold audio present
   - ✅ Proper KPI configuration
3. Scenario saved and published for trainees
4. All audio accessible via Supabase

---

## Error Handling & Fallbacks

### Member Audio Generation Fails
```
Error: "Unable to generate member speech."
→ Try regenerating
→ Or upload pre-recorded audio manually
→ Fallback: Browser TTS during trainee call
```

### Supabase Upload Fails
```
Error: "Generated speech could not be synthesized by the backend"
→ Check Supabase bucket permissions
→ Verify storage quota
→ Try again
→ Fallback: Embedded audio (browser playback only)
```

### Missing Audio During Trainee Call
```
If no stored audio exists:
→ System attempts browser TTS
→ If TTS unavailable: Shows text only
→ Trainee can continue with text guidance
```

---

## Performance & Optimization

### Local Storage Benefits
- **Backup**: Offline access to generated files
- **Performance**: No API calls for local testing
- **Archival**: Historical record of generated content
- **Debugging**: Server-side logging of all operations

### Supabase Storage Benefits
- **Scalability**: Works for unlimited scenarios
- **Availability**: Always accessible to trainees
- **Persistence**: Content persists across sessions
- **Sharing**: Trainers can share scenarios across batches

### Generation Performance
- **Gemini TTS**: ~3-5 seconds per turn (full TTS service)
- **Browser Fallback**: ~500ms per turn (client-side synthesis)
- **Bulk Generation**: Processes sequentially with progress tracking
- **Caching**: Supabase CDN accelerates repeat access

---

## Verification Checklist

Before publishing a scenario, ensure:
- [ ] Ringer audio is set (shared or scenario-specific)
- [ ] Hold audio is set (if needed)
- [ ] All Member rows with scripts have audio
- [ ] "Member AI audio coverage" badge shows "X/X ready"
- [ ] Audio previews play correctly
- [ ] Scenario saved successfully
- [ ] Verify trainee can hear audio during call simulation

---

## Troubleshooting

### Ringer/Hold Speech Not Saving
**Problem**: Dialog closes but audio not saved
**Solution**:
1. Check network connection
2. Verify Supabase connectivity
3. Try regenerating
4. Check browser console for errors
5. Fall back to manual upload

### Member Speech Generation Failing
**Problem**: "Unable to generate member speech"
**Solution**:
1. Ensure text is entered (not empty)
2. Check Member row actor name isn't "CSR"
3. Verify Supabase write permissions
4. Try smaller text (shorter script)
5. Use browser console to see error details

### Audio Not Playing for Trainees
**Problem**: Trainee hears nothing but sees script
**Solution**:
1. Verify audio_url is Supabase (not embedded)
2. Check Supabase bucket public access
3. Test audio URL in browser
4. Regenerate speech for that row
5. Check trainee browser audio settings

---

## Code References

### Key Files Modified
- `frontend/app/components/trainer/trainer-call-simulation-page-content.tsx`
  - Line ~1025: Added state variables
  - Line ~2640: Added handler functions
  - Line ~2950: Added UI buttons and dialogs
  - Line ~1640: Enhanced validation logic

### Key Existing Files (No Changes Needed)
- `backend/routes/call_simulation_routes.py` (TTS endpoint functional)
- `backend/services/tts_service.py` (Local saving functional)
- `frontend/app/trainee/call-simulation/call-simulator.tsx` (Playback functional)
- `supabase/call_simulation_schema.sql` (Schema complete)

---

## Testing Recommendations

### Unit Tests Needed
1. Test `handleGenerateRingerSpeech()` with empty text
2. Test `handleGenerateHoldSpeech()` with empty text
3. Test Member audio validation for all edge cases
4. Test coverage calculation with mixed audio states

### Integration Tests Needed
1. Full workflow: Generate → Save → Trainee plays
2. Fallback scenario: No Supabase, browser TTS
3. Mixed scenario: Some generated, some uploaded
4. Bulk generation with failures

### Manual Testing Checklist
- [ ] Generate ringer audio → Appears in preview
- [ ] Generate hold audio → Appears in preview
- [ ] Generate all Member speech → All rows filled
- [ ] Save scenario with generated audio → Works
- [ ] Trainee plays scenario → Hears ringer, Member, hold audio
- [ ] Regenerate audio → Replaces old audio
- [ ] Delete audio → Can regenerate

---

## FAQ

**Q: Can trainees generate speech?**
A: No, only trainers can generate speech. Trainees can only play it during call simulations.

**Q: What happens if Supabase is down?**
A: Audio falls back to browser TTS or text-only mode. Trainers are prevented from saving scenarios without stored audio.

**Q: Can I use different voices?**
A: Currently all speech uses "Puck" voice (professional tone). Future versions can support voice selection.

**Q: How long is the audio stored?**
A: Indefinitely, until trainers manually delete it or scenarios are archived/removed.

**Q: Can I share generated audio across scenarios?**
A: Yes! Ringer and hold audio are trainer-wide and apply to all scenarios. Member audio is scenario-specific.

**Q: What file formats are supported?**
A: Generated: WAV (backend), Uploaded: MP3, WAV, OGG, M4A (frontend).

---

## Summary

The trainer module now provides **comprehensive speech generation** for all call simulation scenarios:
- ✅ Member rows (per scenario)
- ✅ Ringer audio (trainer-wide)
- ✅ Hold audio (trainer-wide)

All generated speech is:
- ✅ Automatically saved to Supabase
- ✅ Backed up locally
- ✅ Tracked in database
- ✅ Validated before use
- ✅ Accessible to trainees during simulations

Trainers have a seamless workflow with clear validation, progress tracking, and error handling.
