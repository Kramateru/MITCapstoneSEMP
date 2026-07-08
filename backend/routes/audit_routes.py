"""Admin audit trail routes."""

from __future__ import annotations

import csv
from datetime import datetime, time
from io import BytesIO, StringIO
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response, StreamingResponse
from openpyxl import Workbook
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle
from sqlalchemy import distinct, func, or_
from sqlalchemy.orm import Session

from backend import auth_utils
from backend.database import get_db
from backend.models import AuditLog, User
from backend.services.audit import create_audit_log

router = APIRouter(prefix="/api/audit", tags=["audit"])


def _parse_date(value: Optional[str], *, end_of_day: bool = False) -> Optional[datetime]:
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is not None:
        parsed = parsed.replace(tzinfo=None)
    if len(value) <= 10:
        parsed = datetime.combine(parsed.date(), time.max if end_of_day else time.min)
    return parsed


def _serialize_log(log: AuditLog) -> dict:
    return {
        "id": log.id,
        "user_id": log.user_id,
        "user_name": log.user_name,
        "user_email": log.user_email,
        "role": log.role,
        "action_type": log.action_type,
        "module_name": log.module_name,
        "entity_type": log.entity_type,
        "entity_id": log.entity_id,
        "description": log.description,
        "old_data": log.old_data or {},
        "new_data": log.new_data or {},
        "changed_fields": log.changed_fields or [],
        "status": log.status,
        "severity": log.severity,
        "ip_address": log.ip_address,
        "browser_info": log.browser_info,
        "device_type": log.device_type,
        "batch_id": log.batch_id,
        "trainee_id": log.trainee_id,
        "trainer_id": log.trainer_id,
        "session_id": log.session_id,
        "request_id": log.request_id,
        "endpoint": log.endpoint,
        "http_method": log.http_method,
        "http_status": log.http_status,
        "metadata": log.metadata_json or {},
        "timestamp": log.timestamp.isoformat() if log.timestamp else None,
    }


def _filtered_query(
    db: Session,
    *,
    search: Optional[str] = None,
    role: Optional[str] = None,
    module: Optional[str] = None,
    action_type: Optional[str] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    batch_id: Optional[str] = None,
    trainee_id: Optional[str] = None,
    trainer_id: Optional[str] = None,
    endpoint: Optional[str] = None,
    request_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    query = db.query(AuditLog)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                AuditLog.user_name.ilike(pattern),
                AuditLog.user_email.ilike(pattern),
                AuditLog.action_type.ilike(pattern),
                AuditLog.module_name.ilike(pattern),
                AuditLog.entity_type.ilike(pattern),
                AuditLog.entity_id.ilike(pattern),
                AuditLog.description.ilike(pattern),
                AuditLog.endpoint.ilike(pattern),
            )
        )
    if role:
        query = query.filter(AuditLog.role == role)
    if module:
        query = query.filter(AuditLog.module_name == module)
    if action_type:
        query = query.filter(AuditLog.action_type == action_type)
    if severity:
        query = query.filter(AuditLog.severity == severity)
    if status:
        query = query.filter(AuditLog.status == status)
    if batch_id:
        query = query.filter(AuditLog.batch_id == batch_id)
    if trainee_id:
        query = query.filter(AuditLog.trainee_id == trainee_id)
    if trainer_id:
        query = query.filter(AuditLog.trainer_id == trainer_id)
    if endpoint:
        query = query.filter(AuditLog.endpoint.ilike(f"%{endpoint.strip()}%"))
    if request_id:
        query = query.filter(AuditLog.request_id == request_id)
    parsed_start = _parse_date(start_date)
    parsed_end = _parse_date(end_date, end_of_day=True)
    if parsed_start:
        query = query.filter(AuditLog.timestamp >= parsed_start)
    if parsed_end:
        query = query.filter(AuditLog.timestamp <= parsed_end)
    return query


@router.get("/logs", response_model=dict)
async def list_audit_logs(
    search: Optional[str] = None,
    role: Optional[str] = None,
    module: Optional[str] = None,
    action_type: Optional[str] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    batch_id: Optional[str] = None,
    trainee_id: Optional[str] = None,
    trainer_id: Optional[str] = None,
    endpoint: Optional[str] = None,
    request_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    sort: str = Query("newest", pattern="^(newest|oldest)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_utils.require_admin),
):
    query = _filtered_query(
        db,
        search=search,
        role=role,
        module=module,
        action_type=action_type,
        severity=severity,
        status=status,
        batch_id=batch_id,
        trainee_id=trainee_id,
        trainer_id=trainer_id,
        endpoint=endpoint,
        request_id=request_id,
        start_date=start_date,
        end_date=end_date,
    )
    total = query.count()
    order_by = AuditLog.timestamp.asc() if sort == "oldest" else AuditLog.timestamp.desc()
    logs = query.order_by(order_by).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "logs": [_serialize_log(log) for log in logs],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "admin_user_id": current_user.id,
    }


@router.get("/summary", response_model=dict)
async def audit_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_utils.require_admin),
):
    today_start = datetime.combine(datetime.utcnow().date(), time.min)
    total_logs = db.query(func.count(AuditLog.id)).scalar() or 0
    logs_today = db.query(func.count(AuditLog.id)).filter(AuditLog.timestamp >= today_start).scalar() or 0
    failed_actions = db.query(func.count(AuditLog.id)).filter(AuditLog.status == "failed").scalar() or 0
    login_attempts = (
        db.query(func.count(AuditLog.id))
        .filter(AuditLog.action_type.in_(["login_attempt", "login_success", "login_failure"]))
        .scalar()
        or 0
    )
    active_users_today = (
        db.query(func.count(distinct(AuditLog.user_id)))
        .filter(AuditLog.timestamp >= today_start, AuditLog.user_id.isnot(None))
        .scalar()
        or 0
    )
    recent_critical = (
        db.query(AuditLog)
        .filter(AuditLog.severity.in_(["critical", "warning"]))
        .order_by(AuditLog.timestamp.desc())
        .limit(8)
        .all()
    )
    module_counts = (
        db.query(AuditLog.module_name, func.count(AuditLog.id))
        .group_by(AuditLog.module_name)
        .order_by(func.count(AuditLog.id).desc())
        .limit(10)
        .all()
    )
    role_counts = (
        db.query(AuditLog.role, func.count(AuditLog.id))
        .group_by(AuditLog.role)
        .order_by(func.count(AuditLog.id).desc())
        .all()
    )
    top_users = (
        db.query(AuditLog.user_name, AuditLog.user_email, func.count(AuditLog.id))
        .filter(AuditLog.user_id.isnot(None))
        .group_by(AuditLog.user_name, AuditLog.user_email)
        .order_by(func.count(AuditLog.id).desc())
        .limit(8)
        .all()
    )
    trend_rows = (
        db.query(func.date(AuditLog.timestamp), func.count(AuditLog.id))
        .group_by(func.date(AuditLog.timestamp))
        .order_by(func.date(AuditLog.timestamp).desc())
        .limit(14)
        .all()
    )
    login_trend_rows = (
        db.query(func.date(AuditLog.timestamp), func.count(AuditLog.id))
        .filter(AuditLog.action_type.in_(["login_attempt", "login_success", "login_failure"]))
        .group_by(func.date(AuditLog.timestamp))
        .order_by(func.date(AuditLog.timestamp).desc())
        .limit(14)
        .all()
    )
    action_buckets = {
        "Assessment Activity": db.query(func.count(AuditLog.id)).filter(AuditLog.module_name == "Assessment").scalar() or 0,
        "Microlearning Activity": db.query(func.count(AuditLog.id)).filter(AuditLog.module_name == "Microlearning").scalar() or 0,
        "Call Simulation Activity": db.query(func.count(AuditLog.id)).filter(AuditLog.module_name == "Call Simulation").scalar() or 0,
        "Coaching Activity": db.query(func.count(AuditLog.id)).filter(AuditLog.module_name == "Coaching").scalar() or 0,
    }
    return {
        "total_logs": total_logs,
        "logs_today": logs_today,
        "failed_actions": failed_actions,
        "login_attempts": login_attempts,
        "active_users_today": active_users_today,
        "recent_critical": [_serialize_log(log) for log in recent_critical],
        "activity_by_module": [
            {"module": module or "System", "count": count}
            for module, count in module_counts
        ],
        "activity_by_role": [
            {"role": role or "system", "count": count}
            for role, count in role_counts
        ],
        "most_active_users": [
            {"user": name or email or "Unknown", "email": email, "count": count}
            for name, email, count in top_users
        ],
        "activity_trend": [
            {"date": str(date), "count": count}
            for date, count in reversed(trend_rows)
        ],
        "login_trend": [
            {"date": str(date), "count": count}
            for date, count in reversed(login_trend_rows)
        ],
        "activity_totals": action_buckets,
        "admin_user_id": current_user.id,
    }


@router.get("/filter-options", response_model=dict)
async def audit_filter_options(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_utils.require_admin),
):
    def values(column):
        return [
            value
            for (value,) in db.query(column).filter(column.isnot(None)).distinct().order_by(column.asc()).all()
            if value
        ]

    return {
        "roles": values(AuditLog.role),
        "modules": values(AuditLog.module_name),
        "actions": values(AuditLog.action_type),
        "severities": values(AuditLog.severity),
        "statuses": values(AuditLog.status),
        "endpoints": values(AuditLog.endpoint),
        "admin_user_id": current_user.id,
    }


def _export_rows(query) -> list[dict]:
    return [_serialize_log(log) for log in query.order_by(AuditLog.timestamp.desc()).limit(5000).all()]


def _export_file_name(format_name: str) -> str:
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    return f"audit-trail-{timestamp}.{format_name}"


@router.get("/export")
async def export_audit_logs(
    format: str = Query("csv", pattern="^(csv|xlsx|pdf)$"),
    search: Optional[str] = None,
    role: Optional[str] = None,
    module: Optional[str] = None,
    action_type: Optional[str] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    batch_id: Optional[str] = None,
    trainee_id: Optional[str] = None,
    trainer_id: Optional[str] = None,
    endpoint: Optional[str] = None,
    request_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_utils.require_admin),
):
    query = _filtered_query(
        db,
        search=search,
        role=role,
        module=module,
        action_type=action_type,
        severity=severity,
        status=status,
        batch_id=batch_id,
        trainee_id=trainee_id,
        trainer_id=trainer_id,
        endpoint=endpoint,
        request_id=request_id,
        start_date=start_date,
        end_date=end_date,
    )
    rows = _export_rows(query)
    headers = [
        "timestamp",
        "user_name",
        "user_email",
        "role",
        "action_type",
        "module_name",
        "entity_type",
        "entity_id",
        "status",
        "severity",
        "ip_address",
        "description",
    ]

    create_audit_log(
        db,
        user=current_user,
        action_type="report_exported",
        module_name="Audit Trail",
        entity_type="audit_logs",
        description=f"Exported {len(rows)} audit log rows as {format.upper()}.",
        status="success",
        severity="info",
        metadata={"format": format, "row_count": len(rows)},
    )
    db.commit()

    if format == "xlsx":
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "Audit Trail"
        worksheet.append(headers)
        for row in rows:
            worksheet.append([row.get(header) for header in headers])
        output = BytesIO()
        workbook.save(output)
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={_export_file_name('xlsx')}"},
        )

    if format == "pdf":
        output = BytesIO()
        document = SimpleDocTemplate(output, pagesize=landscape(letter))
        table_data = [headers[:8]]
        for row in rows[:250]:
            table_data.append([str(row.get(header) or "")[:70] for header in headers[:8]])
        table = Table(table_data, repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1d4ed8")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d7dee8")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        document.build([table])
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={_export_file_name('pdf')}"},
        )

    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={_export_file_name('csv')}"},
    )
