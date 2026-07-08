"""
Certificate generation service for trainee completion and competency records.
"""

from __future__ import annotations

import base64
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Optional

from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _resolve_image_source(image_ref: Optional[str]) -> Optional[str | BytesIO]:
    if not image_ref:
        return None

    value = image_ref.strip()
    if not value:
        return None

    try:
        if value.startswith("data:image") and "," in value:
            _, encoded = value.split(",", 1)
            return BytesIO(base64.b64decode(encoded))

        candidate = Path(value)
        if not candidate.is_absolute():
            repo_root = Path(__file__).resolve().parents[2]
            if value.startswith("/"):
                candidate = repo_root / "frontend" / "public" / value.lstrip("/")
            else:
                candidate = repo_root / value

        if candidate.exists():
            return str(candidate)
    except Exception:
        return None

    return None


def _build_image(image_ref: Optional[str], width: float, height: float) -> Optional[Image]:
    resolved = _resolve_image_source(image_ref)
    if not resolved:
        return None

    try:
        image = Image(resolved, width=width, height=height)
        image.hAlign = "CENTER"
        return image
    except Exception:
        return None


def generate_certificate_pdf(
    *,
    trainee_name: str,
    achievement_title: str,
    achievement_type: str,
    certificate_no: str,
    verification_url: str,
    issued_at: datetime,
    institution_name: str,
    institution_address: str,
    contact_number: Optional[str],
    contact_email: Optional[str],
    logo_url: Optional[str],
    signatory_name: str,
    signatory_title: str,
    signature_url: Optional[str],
    certificate_title: str,
    certificate_subtitle: str,
    certificate_intro: str,
    certificate_outro: str,
    certificate_footer: str,
    issuer_name: Optional[str],
    score: Optional[float],
) -> BytesIO:
    """
    Build a printable certificate PDF with QR verification and St. Peter Velle branding.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        topMargin=18 * mm,
        bottomMargin=16 * mm,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
    )

    styles = getSampleStyleSheet()
    header_style = ParagraphStyle(
        "CertificateHeader",
        parent=styles["Heading1"],
        alignment=TA_CENTER,
        fontSize=22,
        leading=26,
        textColor=colors.HexColor("#102a5e"),
    )
    subheader_style = ParagraphStyle(
        "CertificateSubheader",
        parent=styles["Normal"],
        alignment=TA_CENTER,
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#475569"),
    )
    title_style = ParagraphStyle(
        "CertificateTitle",
        parent=styles["Heading1"],
        alignment=TA_CENTER,
        fontSize=28,
        leading=32,
        textColor=colors.HexColor("#0f172a"),
    )
    subtitle_style = ParagraphStyle(
        "CertificateSubtitle",
        parent=styles["Normal"],
        alignment=TA_CENTER,
        fontSize=13,
        leading=17,
        textColor=colors.HexColor("#334155"),
    )
    body_style = ParagraphStyle(
        "CertificateBody",
        parent=styles["Normal"],
        alignment=TA_CENTER,
        fontSize=14,
        leading=19,
        textColor=colors.HexColor("#1f2937"),
    )
    name_style = ParagraphStyle(
        "CertificateName",
        parent=body_style,
        fontSize=26,
        leading=30,
        textColor=colors.HexColor("#1d4ed8"),
    )
    achievement_style = ParagraphStyle(
        "CertificateAchievement",
        parent=body_style,
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0f172a"),
    )
    footer_style = ParagraphStyle(
        "CertificateFooter",
        parent=styles["Normal"],
        alignment=TA_CENTER,
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#64748b"),
    )

    story = []

    logo = _build_image(logo_url, width=24 * mm, height=24 * mm)
    header_text = [
        Paragraph(f"<b>{institution_name}</b>", header_style),
        Paragraph(institution_address or "", subheader_style),
    ]
    contact_parts = [part for part in [contact_number, contact_email] if part]
    if contact_parts:
        header_text.append(Paragraph(" | ".join(contact_parts), subheader_style))

    if logo:
        header_table = Table(
            [[logo, header_text]],
            colWidths=[34 * mm, 210 * mm],
        )
        header_table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("ALIGN", (0, 0), (0, 0), "CENTER"),
                    ("ALIGN", (1, 0), (1, 0), "CENTER"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        story.append(header_table)
    else:
        for block in header_text:
            story.append(block)

    story.append(Spacer(1, 10))
    story.append(Paragraph(certificate_title, title_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph(certificate_subtitle, subtitle_style))
    story.append(Spacer(1, 18))

    story.append(Paragraph(certificate_intro, body_style))
    story.append(Spacer(1, 8))
    story.append(Paragraph(f"<b>{trainee_name}</b>", name_style))
    story.append(Spacer(1, 14))
    story.append(Paragraph(certificate_outro, body_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph(f"<b>{achievement_title}</b>", achievement_style))
    story.append(Spacer(1, 18))

    info_rows = [
        ["Certificate No.", certificate_no],
        ["Award Type", achievement_type.replace("_", " ").title()],
        ["Issue Date", issued_at.strftime("%B %d, %Y")],
    ]
    if score is not None and score > 0:
        info_rows.append(["Recorded Score", f"{score:.2f}%"])
    if issuer_name:
        info_rows.append(["Recorded By", issuer_name])

    info_table = Table(info_rows, colWidths=[55 * mm, 105 * mm])
    info_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#dbeafe")),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#0f172a")),
                ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#93c5fd")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("PADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )

    qr_code = qr.QrCodeWidget(verification_url)
    bounds = qr_code.getBounds()
    size = 34 * mm
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    qr_drawing = Drawing(size, size, transform=[size / width, 0, 0, size / height, 0, 0])
    qr_drawing.add(qr_code)

    story.append(
        Table(
            [[info_table, qr_drawing]],
            colWidths=[170 * mm, 48 * mm],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("ALIGN", (1, 0), (1, 0), "CENTER"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ]
            ),
        )
    )

    story.append(Spacer(1, 14))

    signature = _build_image(signature_url, width=40 * mm, height=16 * mm)
    signature_block = []
    if signature:
        signature_block.append(signature)
        signature_block.append(Spacer(1, 2))
    signature_block.append(Paragraph(f"<b>{signatory_name}</b>", subtitle_style))
    signature_block.append(Paragraph(signatory_title, footer_style))

    signature_table = Table(
        [[signature_block]],
        colWidths=[85 * mm],
        style=TableStyle(
            [
                ("LINEABOVE", (0, 0), (0, 0), 0.7, colors.HexColor("#94a3b8")),
                ("TOPPADDING", (0, 0), (0, 0), 8),
                ("ALIGN", (0, 0), (0, 0), "CENTER"),
            ]
        ),
    )
    story.append(signature_table)
    story.append(Spacer(1, 10))
    story.append(Paragraph(certificate_footer, footer_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph(verification_url, footer_style))

    doc.build(story)
    buffer.seek(0)
    return buffer
