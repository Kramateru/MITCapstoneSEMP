# Scope and Limitations of the Speech-Enabled BPO Platform

## System Architecture & Modules

### **Core Modules Identified**

1. **Authentication Module** - Auth Routes (`auth_routes.py`)
2. **User Management Module** - User Routes (`user_routes.py`)
3. **Trainee Portal Module** - Trainee Routes (`trainee_routes.py`)
4. **Trainer Portal Module** - Trainer Routes (`trainer_routes.py`)
5. **Admin Portal Module** - Admin Routes (`admin_routes.py`)
6. **Scenario Management Module** - Scenario Routes (`scenario_routes.py`)
7. **Workspace/NLP Configuration Module** - Workspace Routes (`workspace_routes.py`)
8. **Assessment & Feedback Module** - Assessment Routes (`assessment_routes.py`)
9. **Certification Module** - Certification Routes (`certification_routes.py`)
10. **Analytics & Reporting Module** - Analytics Routes (`analytics_routes.py`)
11. **Export & PDF Generation Module** - Export Routes (`export_routes.py`)
12. **Settings & System Configuration Module** - Settings Routes (`settings_routes.py`)
13. **Support & Help Module** - Support Routes (`support_routes.py`)
14. **Notification Module** - Notification Routes (`notification_routes.py`)
15. **Speech Assessment Module** - Speech Assessment Service (`speech_assessment.py`)
16. **Microlearning Module** - Microlearning Service (`microlearning.py`)
17. **Coaching Module** - Coaching Service (`coaching.py`)

---

## Data Models & Entities

### **Core Data Models**
- **User** - Central user entity with role-based differentiation (Admin, Trainer, Trainee) including notification dismiss tracking
- **Batch** - Groups of trainees for batch assignment and management with active/inactive status control
- **Course** - Training programs containing multiple scenarios and microlearning modules
- **CourseAssignment** - Assignment of courses to batches or individuals
- **Scenario** - Practice/assessment use cases with opening prompts and branching logic
- **ScenarioFlow** - Branching logic steps within scenarios (if-then conditions)
- **PracticeSession** - Practice attempt records with scores and feedback
- **Feedback** - Assessment feedback from trainers on trainee performance
- **AssessmentCategory** - Evaluation categories (Pronunciation, Fluency, Grammar, Empathy, Clarity)
- **PerformanceMetrics** - Quantitative performance tracking

### **Advanced Models**
- **MicrolearningModule** - Short learning modules with assessments
- **MicrolearningAssignment** - Assignment of microlearning to trainees
- **MCQCategory** - Multiple-choice question categories
- **MCQQuestion** - Quiz questions with options
- **MCQAssessment** - Assessment instances assigned to users
- **MCQSubmission** - User responses to MCQ assessments
- **CoachingTemplate** - Coaching feedback templates
- **CoachingLog** - Coaching records between trainer and trainee
- **CompetencyVerdict** - Final competency assessment results
- **CertificateRecord** - Digital certificates awarded
- **NotificationRead** - Per-user notification read state tracking

### **Configuration Models**
- **KPIConfiguration** - Global weighted scoring configuration (accuracy, fluency, clarity, keyword adherence, soft skills)
- **Workspace** - Trainer-specific NLP customization (empathy statements, probing questions, forbidden words, required keywords)
- **LineOfBusiness** - Business line configurations
- **SystemSettings** - Global branding, date format, accessibility settings
- **CertificationSettings** - Certificate generation and verification rules

---

## Module Functions & API Endpoints

### **1. Authentication Module** (`/api/auth`)
The authentication module handles user login, session management, and token validation for secure access to the platform. It provides endpoints for user login with JWT token generation, session cleanup during logout, and retrieval of authenticated user profiles. Additionally, it supports JWT token refresh mechanisms and token validation to ensure ongoing secure access.

This module also includes endpoints for verifying token authenticity and managing user sessions across the application. It integrates with the user management system to provide seamless authentication flows while maintaining security through encrypted password storage and time-limited tokens.

### **2. User Management Module** (`/api/users`)
The user management module enables comprehensive user account operations including registration, profile management, and administrative controls. It supports new user account creation with validation, fetching detailed user information, and updating personal profiles. Users can upload and manage profile images, change passwords securely, and access their account details.

For administrative purposes, this module provides endpoints to list all users, retrieve specific user information, update user accounts, and delete user accounts when necessary. It ensures proper role-based access control and maintains audit trails for user management activities.

**Recent Enhancements:**
- Users can now remove their Line of Business (LOB) association from their profile settings, providing flexibility in organizational structure management.

### **3. Trainee Portal Module** (`/api/trainee`)
The trainee portal module serves as the primary interface for trainees to engage with training content and track their progress. It allows trainees to set their language dialect preferences and customize UI settings for optimal learning experience. Trainees can view scenarios assigned by their trainers and browse all published scenarios for self-directed learning.

The module facilitates practice sessions through audio recording and real-time ASR assessment, enabling trainees to receive immediate feedback on their pronunciation, fluency, clarity, keyword adherence, and soft skills. It maintains comprehensive training history, allowing trainees to review past sessions, acknowledge feedback, and track performance trends through detailed analytics and progress reports.

### **4. Trainer Portal Module** (`/api/trainer`)
The trainer portal module empowers trainers to manage their training programs and monitor trainee performance effectively. It provides comprehensive batch management capabilities including creating, updating, and deleting trainee batches, as well as bulk assignment of trainees to specific batches. Trainers can create and manage training courses composed of scenarios and microlearning modules.

The module supports course assignment to individual trainees or entire batches, with tracking of assignment progress and completion. Trainers can review trainee interaction history, verify ASR transcriptions for accuracy, and provide detailed feedback on practice sessions. It includes analytics features for monitoring batch and individual trainee performance, with capabilities to export performance reports in PDF format.

**Recent Enhancements:**
- Added "Remove from Batch" functionality allowing trainers to remove individual trainees from batches through the trainee modification interface
- Implemented batch status management with active/inactive states - only active batches can be selected for new trainee assignments, providing better batch lifecycle control
- Enhanced batch assignment workflows to filter and display only active batches in trainee creation and modification forms
- Updated bulk upload processes to validate batch assignments against active batches only

### **5. Admin Portal Module** (`/api/admin`)
The admin portal module provides system-wide administrative controls and configuration management. It enables administrators to create and manage scenarios across different purposes (practice, assessment, certification), publish scenarios to make them available system-wide, and define assessment categories for evaluation criteria. The module supports global KPI configuration, adjusting scoring weights for accuracy, fluency, clarity, keyword adherence, and soft skills.

Administrators can manage all user accounts through manual creation or bulk upload processes, view comprehensive user lists, and perform system-level user management. The module also handles Line of Business (LOB) creation and management, and provides access to system audit logs and administrative dashboards for monitoring platform health and usage metrics.

### **6. Scenario Management Module** (`/api/scenarios`)
The scenario management module handles the creation and configuration of interactive training scenarios with branching logic. It supports building complex scenario flows with conditional branching based on trainee responses, allowing for realistic conversational training experiences. Administrators can create scenario steps with specific prompts and expected responses.

The module provides endpoints for publishing scenarios to make them available for training, as well as managing scenario flow steps including creation, updates, and deletion. It ensures scenarios are properly structured and validated before deployment to training environments.

### **7. Workspace/NLP Configuration Module** (`/api/workspace`)
The workspace module enables trainers to customize NLP rules and conversational elements specific to their training programs. It supports creation and management of trainer-specific workspaces with configurable empathy statements, probing questions, forbidden words, and required keywords. Trainers can build libraries of conversational elements tailored to their industry and training objectives.

The module provides import/export capabilities for NLP configurations, allowing trainers to share or backup their customizations. It includes approval workflows for production deployment and tracks usage statistics for NLP elements to optimize training effectiveness.

### **8. Assessment & Feedback Module** (`/api/assessment`)
The assessment module manages practice sessions and feedback mechanisms throughout the training process. It handles the creation and recording of practice attempts with comprehensive scoring data including accuracy, fluency, clarity, keyword adherence, and soft skills metrics. The module supports real-time feedback submission and retrieval for specific sessions.

It provides acknowledgment mechanisms for feedback review and maintains detailed session histories. The module also includes WebSocket support for live practice session updates and interactive assessment workflows.

### **9. Certification Module** (`/api/certification`)
The certification module manages advanced assessment types and formal credentialing processes. It supports multiple-choice question (MCQ) management including category creation, question development, and assessment assignment to trainees. The module handles MCQ assessment creation, question categorization, and automated assessment generation.

It includes coaching functionality with template creation, coaching log management, and compliance tracking. The module supports competency verdict issuance, certificate generation and verification, and maintains certification settings for security and authenticity.

### **10. Export & Reporting Module** (`/api/export`)
The export module provides comprehensive reporting and document generation capabilities. It generates PDF reports for individual practice sessions, trainee progress summaries, and batch performance analytics. The module supports custom report creation with flexible formatting options.

It includes cloud storage integration for report backup and retrieval, with health monitoring for cloud service connectivity. The module ensures reports are professionally formatted and accessible across different platforms.

### **11. Analytics Module** (`/api/analytics`)
The analytics module delivers detailed performance insights and dashboard views for different user roles. It provides trainee-specific analytics including progress tracking, session histories, and performance metrics over time. The module supports batch-level analytics for trainers to monitor group performance.

It offers role-specific dashboards with tailored metrics and visualizations, including performance hubs for comprehensive data exploration. The module enables data export capabilities for further analysis and integration with external systems.

**Recent Enhancements:**
- Added trainer Reports page with comprehensive analytics including pronunciation error summaries, per-trainee error details, and improvement insights
- Implemented progress graphs with overview, weekly trends, category trends, and trainee trend lines
- Added monthly performance reports with pass rates and improvement deltas
- Integrated advanced filtering for scope (batch/trainee), metric views, and time periods (7 days, 30 days, month, quarter)
- Added print-friendly report generation for trainer analytics
- Connected analytics to Supabase-backed session and assessment data for real-time insights

### **12. Settings Module** (`/api/settings`)
The settings module manages user preferences and system-wide configuration options. It handles individual user preferences including sidebar state, layout options, accessibility settings, and theme selections. The module supports UI customization for optimal user experience.

For administrators, it provides system-wide settings management including branding customization, date format configuration, and global accessibility options. The module ensures consistent user experience while allowing personalization within defined boundaries.

### **13. Notification Module** (`/api/notifications`)
The notification module provides role-based notification management and delivery system. It supports in-app notifications with persistent dismiss state tracking, allowing users to receive important updates, feedback requests, and system announcements. The module handles notification creation, delivery, and dismissal across different user roles (Admin, Trainer, Trainee).

It includes notification persistence in the database with user-specific dismiss tracking, ensuring notifications remain dismissed across sessions. The module supports real-time notification delivery and integrates with the broader platform communication system.

---

## Role-Based Scope & Limitations

### **ADMIN Role**
**Scope (What Admins Can Do):**
- Create, update, publish, and delete scenarios for practice, assessment, and certification purposes
- Define and manage assessment categories (Pronunciation, Fluency, Grammar, Empathy, Clarity)
- Configure global KPI scoring weights and thresholds (accuracy, fluency, clarity, keyword adherence, soft skills)
- Create and manage all user accounts manually or through bulk Excel upload
- Assign user roles (Admin, Trainer, Trainee) and manage user permissions
- Create and manage Lines of Business (LOB) for organizational structure
- Configure system-wide settings including branding, themes, date formats, and accessibility
- View comprehensive system audit logs and administrative dashboards
- Approve trainer workspace configurations for production deployment
- Access all system analytics and performance metrics across the platform
- Receive and manage in-app notifications with persistent dismiss tracking

**Limitations:**
- Cannot participate in practice scenarios or training sessions as a trainee
- Cannot create or manage personal batches of trainees (Trainer responsibility)
- Cannot provide individual feedback or coaching to trainees (Trainer responsibility)
- Cannot access trainee-specific session data without explicit audit logging
- Cannot modify trainer-created courses, batches, or workspace configurations
- Cannot manually override or modify trainee assessment scores
- Cannot customize NLP rules in trainer workspaces
- Cannot issue competency verdicts or certificates directly (requires formal assessment process)
- Restricted from accessing individual trainee progress data outside audit contexts

**Key Endpoints:** `/api/admin/*`, `/api/scenario/*`, `/api/certification/*`, `/api/settings/system*`

---

### **TRAINER Role**
**Scope (What Trainers Can Do):**
- Create, update, delete, and manage batches of trainees with custom settings
- Activate/deactivate batches to control which batches are available for trainee assignment
- Add/remove trainees from batches through individual assignment or bulk operations
- Remove individual trainees from batches using the "Remove from Batch" functionality
- Create and manage training courses composed of scenarios and microlearning modules
- Publish courses to make them available for assignment to trainees
- Assign courses to individual trainees or entire batches with progress tracking
- Create and manage microlearning modules with various assessment methods
- Assign microlearning tasks to trainees based on identified skill gaps
- Review trainee practice session transcripts and interaction histories
- Verify and correct ASR transcription errors in trainee sessions
- Submit detailed feedback on trainee performance with scoring and comments
- Create and use coaching templates for standardized feedback delivery
- Log coaching sessions with trainees and track coaching compliance
- Customize workspace NLP configurations (empathy statements, probing questions, forbidden words, required keywords)
- View detailed analytics for their batches and assigned trainees
- Export performance reports in PDF format for individual trainees and batches
- Create trainee accounts through bulk upload with Excel templates (validates against active batches only)
- Access trainer-specific dashboards with performance metrics and insights
- Receive and manage in-app notifications with persistent dismiss tracking

**Limitations:**
- Cannot create or modify scenarios (Admin-only privilege)
- Cannot define assessment categories or modify global KPI configurations
- Cannot change certification settings or issue competency verdicts
- Cannot access other trainers' batches, courses, or workspace configurations
- Cannot view or modify system-wide settings (branding, themes, accessibility)
- Cannot access admin audit logs or system-level dashboards
- Cannot approve workspace configurations for production (Admin approval required)
- Cannot manually create user accounts outside bulk upload processes
- Cannot override Admin-configured scoring weights or thresholds
- Cannot access trainee data from other trainers' batches
- Cannot deactivate batches that contain active trainees (must remove trainees first)

**Key Endpoints:** `/api/trainer/*`, `/api/workspace/*`, `/api/certification/coaching*`

---

### **TRAINEE Role**
**Scope (What Trainees Can Do):**
- Configure personal language dialect preferences for ASR processing
- Customize UI preferences including theme, layout, and accessibility settings
- View scenarios assigned by trainers through course assignments
- Browse and self-register for all published scenarios not requiring formal assignment
- Access detailed scenario information including prompts and branching logic
- Record audio responses and submit them for real-time ASR assessment
- Receive immediate feedback on pronunciation, fluency, clarity, keyword usage, and soft skills
- Create and manage practice sessions with comprehensive scoring data
- View complete training history with session details and performance metrics
- Acknowledge trainer feedback to mark it as reviewed
- Access progress reports and performance trend analytics
- Complete assigned courses and track completion percentages
- Participate in microlearning modules with exercise submissions
- Take assigned MCQ assessments and submit responses
- View coaching logs and feedback from trainers
- Acknowledge coaching feedback and track coaching compliance
- View earned certificates and download PDF versions
- Verify certificate authenticity using unique tokens
- Upload and manage profile images
- Change personal passwords and update profile information
- Receive and manage in-app notifications with persistent dismiss tracking

**Limitations:**
- Cannot create, modify, or delete scenarios, courses, or training content
- Cannot assign training materials to themselves or other users
- Cannot create or manage batches of trainees
- Cannot provide feedback or coaching to other trainees
- Cannot access other trainees' session data, feedback, or performance metrics
- Cannot modify scenario flow, prompts, or assessment criteria
- Cannot override their own assessment scores or feedback
- Cannot access administrative settings or system configurations
- Cannot view trainer dashboards or batch-level analytics
- Cannot create user accounts or manage other users
- Cannot access system audit logs or administrative functions
- Cannot customize NLP rules or workspace configurations
- Cannot publish scenarios or make them available to others
- Cannot define assessment categories or modify scoring algorithms
- Cannot issue certificates or competency verdicts
- Cannot export reports for other users or batches

**Key Endpoints:** `/api/trainee/*`, `/api/certification/mcq/my-*`, `/api/certification/coaching/logs`

---

## Cross-Cutting Concerns & Shared Functions

### **Common Across All Roles:**
- User authentication and JWT token management
- Profile image upload and management
- Password change functionality
- UI preference customization (theme, layout, accessibility)
- Personal progress and performance metrics viewing
- Certificate verification (after issuance)
- In-app notification management with persistent dismiss tracking

### **Data Access Control Patterns:**
1. **User Ownership:** Trainees can only see their own data; Trainers see their created resources and assigned trainees
2. **Role-Based Verification:** Every route validates user role using `verify_admin()`, `verify_trainer()`, `verify_trainee()`
3. **Organizational Hierarchy:** Batch → Trainer → Admin (enforcement throughout API)
4. **Audit Logging:** Admin actions logged to `SystemLog` table for compliance

---

## System Constraints & Technical Limitations

### **Scoring & Assessment:**
- KPI weights must sum to 100%
- Accuracy: 30% | Fluency: 30% | Clarity: 15% | Keyword Adherence: 15% | Soft Skills: 10%
- Passing score: 70% (configurable)
- ASR confidence threshold: 0.75 default (configurable 0-1 scale)

---

## New features implemented (comprehensive platform enhancements)

- Added trainer module navigation item "Reports" (`/trainer/reports`) and corresponding dashboard page.
- Implemented automatic summary generation for batch/wave pronunciation errors and per-trainee error detail via analytics endpoints.
- Added improvement needs insights for grammar, pronunciation, pacing, soft skills, and category-level suggestions.
- Added progress graphs (overview, weekly trends, category trends, trainee trend lines) in analytics UI.
- Added monthly performance report data per trainee and per batch/wave with pass rate and improvement delta.
- Added analytics filters for selecting scope (batch/trainee), metric view, and period (last 7 days, 30 days, month, quarter).
- Added "Print report" button in trainer analytics to produce printer-friendly output.
- Connected analytics and reporting endpoints to Supabase-backed session/assessment data via backend models and routes.
- Added role-based notification system with in-app popover and dismiss behavior:
  - notifications are removed after click for trainee/trainer/admin,
  - dismiss state is now persisted (backend `dismissed_notifications` on `User`, `/api/notifications/dismiss`).
- **Profile Management Enhancement:** Added LOB (Line of Business) removal functionality allowing users to disassociate themselves from their assigned Line of Business through profile settings.
- **Batch Management Enhancements:** 
  - Implemented batch status (active/inactive) functionality with database connectivity
  - Added UI controls for trainers to activate/deactivate batches
  - Only active batches can be selected for trainee assignment in creation and modification forms
  - Updated bulk upload validation to only accept active batches
  - Added "Remove from Batch" button in trainee Modify flow for individual trainee removal


### **Session Management:**
- Minimum response duration: 2 seconds (configurable)
- Maximum response duration: 60 seconds (configurable)
- Dead air timeout default: 5 seconds
- Maximum hints per session: 3

### **Batch & Course Management:**
- Courses are composed of scenario lists stored as JSON
- Batches organized by wave number and LOB
- Course assignments can target batch or individual trainee
- Batch status management with active/inactive states
- Only active batches available for new trainee assignments
- Batch deactivation requires removal of all assigned trainees first

### **Workspace Customization:**
- Trainer-specific NLP configuration per workspace
- Empathy statements with usage tracking
- Probing questions with difficulty levels
- Forbidden words with severity levels (low/medium/high)
- Production approval required for deployment

### **File Management:**
- Profile images: max 5MB, supported formats (JPG, PNG, WebP, GIF)
- Audio files: stored in Supabase, streaming enabled
- PDF exports: generated on-demand with custom formatting

---

## Data Privacy & Security

- Passwords hashed with bcrypt (never stored in plain text)
- JWT tokens expire after 30 minutes (configurable)
- Refresh tokens expire after 7 days
- Email normalization (case-insensitive, trimmed)
- Audit trail maintained for admin actions
- Role-based access control (RBAC) enforced at route level
- Certificate verification tokens with expiration