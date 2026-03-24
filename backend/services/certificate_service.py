"""
Certificate generation service for competency records.
"""

from datetime import datetime
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing


def generate_certificate_pdf(
    trainee_name: str,
    trainer_name: str,
    assessment_date: datetime,
    unit_of_competency: str,
    certificate_no: str,
    verification_url: str,
    institution_name: str,
    registrar_name: str,
    kip_score: float,
) -> BytesIO:
    """
    Build a printable certificate PDF with QR verification.
    """
    buffer = BytesIO()
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CertificateTitle",
        parent=styles["Heading1"],
        alignment=TA_CENTER,
        fontSize=28,
        textColor=colors.HexColor("#0A3D91"),
    )
    subtitle_style = ParagraphStyle(
        "CertificateSubtitle",
        parent=styles["Normal"],
        alignment=TA_CENTER,
        fontSize=12,
        textColor=colors.HexColor("#1E3A8A"),
    )
    body_style = ParagraphStyle(
        "CertificateBody",
        parent=styles["Normal"],
        alignment=TA_CENTER,
        fontSize=13,
    )

    doc = SimpleDocTemplate(buffer, pagesize=A4)
    story = []
    story.append(Spacer(1, 30))
    story.append(Paragraph(institution_name, subtitle_style))
    story.append(Spacer(1, 14))
    story.append(Paragraph("CERTIFICATE OF COMPETENCE", title_style))
    story.append(Spacer(1, 28))
    story.append(Paragraph("This certifies that", subtitle_style))
    story.append(Spacer(1, 10))
    story.append(
        Paragraph(f"<b>{trainee_name}</b>", ParagraphStyle("Name", parent=body_style, fontSize=24))
    )
    story.append(Spacer(1, 14))
    story.append(Paragraph("has been assessed as COMPETENT in", subtitle_style))
    story.append(Spacer(1, 8))
    story.append(Paragraph(f"<b>{unit_of_competency}</b>", body_style))
    story.append(Spacer(1, 24))

    info = [
        ["Certificate No.", certificate_no],
        ["KIP Score", f"{kip_score:.2f}%"],
        ["Assessment Date", assessment_date.strftime("%B %d, %Y")],
        ["Validated By", trainer_name],
        ["Authorized Signature", registrar_name],
    ]
    table = Table(info, colWidths=[170, 280])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#DBEAFE")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#93C5FD")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("PADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 24))

    qr_code = qr.QrCodeWidget(verification_url)
    bounds = qr_code.getBounds()
    size = 90
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    drawing = Drawing(size, size, transform=[size / width, 0, 0, size / height, 0, 0])
    drawing.add(qr_code)
    story.append(drawing)
    story.append(Paragraph("Scan to verify certificate authenticity", subtitle_style))
    story.append(Spacer(1, 6))
    story.append(Paragraph(verification_url, ParagraphStyle("Url", parent=subtitle_style, fontSize=9)))

    doc.build(story)
    buffer.seek(0)
    return buffer
