# Scope and Limitations of the Speech-Enabled BPO Platform

## Project Scope
This project is a web-based training and assessment platform designed for BPO organizations to improve employee readiness through speech-enabled learning, simulation, and performance monitoring. The system combines a Next.js frontend, a FastAPI backend, and Supabase services to provide a centralized environment for training, practice, evaluation, and reporting.

### In Scope
- Role-based access for admin, trainer, and trainee users
- User account management and authentication
- Microlearning modules with audio, video, and transcript support
- Call simulation practice and scenario-based training
- Assessment creation, assignment, scoring, and results tracking
- Reports and analytics for monitoring learner progress
- Certification configuration and audit trail review
- Media upload and storage integration for training content

## Project Limitations
Although the platform is comprehensive for training purposes, it has some practical limitations:

- It is primarily a training and assessment system, not a full enterprise HR, payroll, or live call-center operations platform.
- It depends on external services such as Supabase, storage buckets, and speech-related processing features.
- Performance may be affected by internet connectivity, device quality, and system configuration.
- Some content and assessment quality depend on the accuracy and completeness of data provided by admins and trainers.
- Real-time voice and speech features may vary depending on environment and available resources.
- The platform is intended to support learning and evaluation, not replace actual human coaching or full operational management.

## Functions by Role

### Admin
Admins are responsible for managing the overall system and ensuring the platform runs effectively.

#### Scope of Admin
- Create and manage admin, trainer, and trainee accounts
- Monitor platform-wide performance and reports
- Configure assessment and certification settings
- Review analytics, audit trails, and learning insights
- Oversee coaching workflows and content governance
- Maintain system settings and ensure training structures are properly configured

#### Limitations of Admin
- Admin access is limited to the functions provided by the platform and cannot replace full IT or HR administration.
- Admins may not have direct control over external systems outside the platform unless they are integrated.
- The admin role depends on accurate data and proper configuration from trainers and system settings.

### Trainer
Trainers are responsible for delivering and managing training content and learner development.

#### Scope of Trainer
- Create and manage learning modules and assessments
- Assign assessments to trainees, batches, or waves
- Upload and manage media assets for training content
- Review trainee performance and assessment results
- Provide coaching support and monitor learning progress
- Generate reports for evaluation and improvement

#### Limitations of Trainer
- Trainers can manage assigned learning activities but do not control the entire platform infrastructure.
- Their access is usually limited to content and learner management functions relevant to their role.
- The quality of training outcomes depends on the completeness of uploaded materials and trainee participation.

### Trainee
Trainees use the platform to complete assigned learning activities and improve their skills.

#### Scope of Trainee
- Log in and access assigned training modules
- Complete microlearning lessons and practice activities
- Participate in call simulations and assessments
- Review scores, progress, and learning results
- Improve communication and service performance through guided practice

#### Limitations of Trainee
- Trainees can access only the learning materials and assessments assigned to them.
- Their role is focused on participation and skill development, not system administration or content creation.
- Their performance may be affected by internet access, device capability, and the quality of provided training materials.

## Expected Outcome
The platform provides a structured, role-based environment for speech-enabled BPO training, helping organizations improve learner readiness, monitor progress, and support data-driven coaching decisions.
