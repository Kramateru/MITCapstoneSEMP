"""
PDF Export Service - Generate performance reports and session summaries as PDF
Uses reportlab for PDF generation
"""

from pathlib import Path

from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, PageBreak, KeepTogether
from reportlab.lib import colors
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from io import BytesIO
import uuid


class PerformanceReportGenerator:
    """
    Generate PDF reports for trainee performance and practice sessions
    """
    
    DEFAULT_FONT_SIZE = 10
    TITLE_FONT_SIZE = 16
    HEADING_FONT_SIZE = 12
    REPORT_INSTITUTION_NAME = "St. Peter Ville Technical Training Center, Inc."
    REPORT_INSTITUTION_SUBTITLE = "Speech-Enabled BPO Platform"
    
    def __init__(self, title: str = "Performance Report"):
        self.title = title
        self.buffer = BytesIO()
        self.doc = None
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()
    
    def _setup_custom_styles(self):
        """Setup custom paragraph styles for the report"""
        self.styles.add(ParagraphStyle(
            name='CustomTitle',
            parent=self.styles['Heading1'],
            fontSize=self.TITLE_FONT_SIZE,
            textColor=colors.HexColor('#007BFF'),
            spaceAfter=12,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        ))
        
        self.styles.add(ParagraphStyle(
            name='CustomHeading',
            parent=self.styles['Heading2'],
            fontSize=self.HEADING_FONT_SIZE,
            textColor=colors.HexColor('#333333'),
            spaceAfter=6,
            spaceBefore=6,
            fontName='Helvetica-Bold'
        ))
        
        self.styles.add(ParagraphStyle(
            name='MetricLabel',
            parent=self.styles['Normal'],
            fontSize=8,
            textColor=colors.grey,
            spaceAfter=2
        ))
        self.styles.add(ParagraphStyle(
            name='InstitutionName',
            parent=self.styles['Heading2'],
            fontSize=18,
            textColor=colors.HexColor('#102a5e'),
            alignment=TA_CENTER,
            spaceAfter=4,
            fontName='Helvetica-Bold'
        ))
        self.styles.add(ParagraphStyle(
            name='InstitutionMeta',
            parent=self.styles['Normal'],
            fontSize=10,
            textColor=colors.HexColor('#475569'),
            alignment=TA_CENTER,
            spaceAfter=2,
        ))
        self.styles.add(ParagraphStyle(
            name='ReportSubtitle',
            parent=self.styles['Normal'],
            fontSize=11,
            textColor=colors.HexColor('#334155'),
            alignment=TA_CENTER,
            spaceAfter=10,
            fontName='Helvetica-Bold'
        ))

    def _resolve_default_logo_path(self) -> Optional[str]:
        repo_root = Path(__file__).resolve().parents[2]
        for relative_path in (
            Path("frontend/public/st-peter-seal.png"),
            Path("frontend/public/spvlogo.png"),
            Path("frontend/public/st-peter-seal.svg"),
        ):
            candidate = repo_root / relative_path
            if candidate.exists():
                return str(candidate)
        return None

    def _append_st_peter_header(
        self,
        story: List[Any],
        *,
        report_title: str,
        report_subtitle: Optional[str] = None,
    ) -> None:
        logo_path = self._resolve_default_logo_path()
        logo = None
        if logo_path:
            try:
                logo = Image(logo_path, width=24, height=24)
            except Exception:
                logo = None

        text_blocks = [
            Paragraph(f"<b>{self.REPORT_INSTITUTION_NAME}</b>", self.styles['InstitutionName']),
            Paragraph(self.REPORT_INSTITUTION_SUBTITLE, self.styles['InstitutionMeta']),
            Paragraph(report_title, self.styles['CustomTitle']),
        ]
        if report_subtitle:
            text_blocks.append(Paragraph(report_subtitle, self.styles['ReportSubtitle']))

        if logo:
            header_table = Table(
                [[logo, text_blocks]],
                colWidths=[0.6 * inch, 5.9 * inch],
            )
            header_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('ALIGN', (0, 0), (0, 0), 'CENTER'),
                ('ALIGN', (1, 0), (1, 0), 'CENTER'),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ]))
            story.append(header_table)
        else:
            for block in text_blocks:
                story.append(block)

        story.append(Spacer(1, 0.15 * inch))
    
    def generate_session_summary(
        self,
        trainee_name: str,
        scenario_title: str,
        scenario_difficulty: str,
        date_completed: datetime,
        practice_duration: int,  # seconds
        overall_score: float,
        scores: Dict[str, float],  # accuracy, fluency, clarity, keyword_adherence, soft_skills
        words_total: int,
        words_correct: int,
        filler_words: int,
        keywords_matched: List[str],
        keywords_missed: List[str],
        feedback: Optional[str] = None,
        trainer_notes: Optional[str] = None,
        pass_fail: bool = True,
        logo_path: Optional[str] = None
    ) -> BytesIO:
        """
        Generate a single practice session summary PDF
        
        Returns: BytesIO buffer containing PDF data
        """
        
        story = []
        
        # Header with logo (if provided) and title
        if logo_path:
            try:
                logo = Image(logo_path, width=0.75*inch, height=0.75*inch)
                story.append(logo)
            except:
                pass  # Skip logo if not found
        
        story.append(Paragraph("PRACTICE SESSION SUMMARY", self.styles['CustomTitle']))
        story.append(Spacer(1, 0.3*inch))
        
        # Session Info Header
        session_info = [
            ['Trainee Name:', trainee_name],
            ['Scenario:', scenario_title],
            ['Difficulty:', scenario_difficulty],
            ['Date Completed:', date_completed.strftime("%B %d, %Y at %I:%M %p")],
            ['Duration:', f"{practice_duration // 60} min {practice_duration % 60} sec"],
            ['Status:', "PASSED ✓" if pass_fail else "NEEDS IMPROVEMENT"]
        ]
        
        session_table = Table(session_info, colWidths=[2*inch, 4*inch])
        session_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')])
        ]))
        story.append(session_table)
        story.append(Spacer(1, 0.2*inch))
        
        # Overall Score Section
        story.append(Paragraph("OVERALL PERFORMANCE", self.styles['CustomHeading']))
        
        score_color = colors.HexColor('#28A745') if overall_score >= 70 else colors.HexColor('#FFC107') if overall_score >= 50 else colors.HexColor('#DC3545')
        score_data = [
            [
                Paragraph(f"<font size={self.TITLE_FONT_SIZE} color={score_color.hexValue()}><b>{overall_score:.1f}%</b></font>", self.styles['Normal']),
                Paragraph(self._get_score_interpretation(overall_score), self.styles['Normal'])
            ]
        ]
        
        score_table = Table(score_data, colWidths=[2*inch, 4*inch])
        score_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('FONTSIZE', (0, 0), (-1, -1), 12),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12)
        ]))
        story.append(score_table)
        story.append(Spacer(1, 0.2*inch))
        
        # Detailed Score Breakdown
        story.append(Paragraph("DETAILED SCORES", self.styles['CustomHeading']))
        
        score_breakdown = [
            ['Category', 'Score', 'Status'],
            ['Accuracy', f"{scores.get('accuracy', 0):.1f}%", self._score_to_badge(scores.get('accuracy', 0))],
            ['Fluency', f"{scores.get('fluency', 0):.1f}%", self._score_to_badge(scores.get('fluency', 0))],
            ['Clarity', f"{scores.get('clarity', 0):.1f}%", self._score_to_badge(scores.get('clarity', 0))],
            ['Keyword Adherence', f"{scores.get('keyword_adherence', 0):.1f}%", self._score_to_badge(scores.get('keyword_adherence', 0))],
            ['Soft Skills', f"{scores.get('soft_skills', 0):.1f}%", self._score_to_badge(scores.get('soft_skills', 0))]
        ]
        
        score_breakdown_table = Table(score_breakdown, colWidths=[2.5*inch, 1.5*inch, 1.5*inch])
        score_breakdown_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#007BFF')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')])
        ]))
        story.append(score_breakdown_table)
        story.append(Spacer(1, 0.2*inch))
        
        # Word Analysis
        story.append(Paragraph("WORD ANALYSIS", self.styles['CustomHeading']))
        
        word_accuracy = (words_correct / words_total * 100) if words_total > 0 else 0
        word_analysis = [
            ['Total Words', str(words_total)],
            ['Words Correct', str(words_correct)],
            ['Word Accuracy', f"{word_accuracy:.1f}%"],
            ['Filler Words Detected', str(filler_words)]
        ]
        
        word_table = Table(word_analysis, colWidths=[2.5*inch, 2.5*inch])
        word_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey)
        ]))
        story.append(word_table)
        story.append(Spacer(1, 0.2*inch))
        
        # Keywords Section
        if keywords_matched or keywords_missed:
            story.append(Paragraph("KEYWORD ANALYSIS", self.styles['CustomHeading']))
            
            if keywords_matched:
                matched_text = ", ".join(keywords_matched)
                story.append(Paragraph(f"<b>Keywords Used:</b> {matched_text}", self.styles['Normal']))
            
            if keywords_missed:
                missed_text = ", ".join(keywords_missed)
                story.append(Paragraph(
                    f"<b>Keywords to Focus On:</b> {missed_text}",
                    self.styles['Normal']
                ))
            
            story.append(Spacer(1, 0.1*inch))
        
        # Feedback Section
        if feedback:
            story.append(Paragraph("AUTOMATED FEEDBACK", self.styles['CustomHeading']))
            story.append(Paragraph(feedback, self.styles['Normal']))
            story.append(Spacer(1, 0.1*inch))
        
        # Trainer Notes
        if trainer_notes:
            story.append(Paragraph("TRAINER NOTES", self.styles['CustomHeading']))
            story.append(Paragraph(trainer_notes, self.styles['Normal']))
            story.append(Spacer(1, 0.1*inch))
        
        # Recommendations
        story.append(Paragraph("RECOMMENDATIONS", self.styles['CustomHeading']))
        recommendations = self._generate_recommendations(scores, overall_score)
        for rec in recommendations:
            story.append(Paragraph(f"• {rec}", self.styles['Normal']))
        
        # Footer
        story.append(Spacer(1, 0.3*inch))
        story.append(Paragraph(
            f"<i>Generated on {datetime.now().strftime('%B %d, %Y at %I:%M %p')}</i>",
            self.styles['MetricLabel']
        ))
        
        # Build PDF
        doc = SimpleDocTemplate(
            self.buffer,
            pagesize=letter,
            rightMargin=0.75*inch,
            leftMargin=0.75*inch,
            topMargin=0.75*inch,
            bottomMargin=0.75*inch,
            title=self.title
        )
        
        doc.build(story)
        self.buffer.seek(0)
        return self.buffer
    
    def generate_progress_report(
        self,
        trainee_name: str,
        date_range_start: datetime,
        date_range_end: datetime,
        total_sessions: int,
        passed_sessions: int,
        failed_sessions: int,
        average_score: float,
        trends: List[Dict[str, Any]],
        scenarios_completed: List[str],
        weaknesses: List[str],
        strengths: List[str],
        logo_path: Optional[str] = None
    ) -> BytesIO:
        """
        Generate a comprehensive progress report for a trainee
        
        Returns: BytesIO buffer containing PDF data
        """
        
        story = []
        
        # Header
        if logo_path:
            try:
                logo = Image(logo_path, width=0.75*inch, height=0.75*inch)
                story.append(logo)
            except:
                pass
        
        story.append(Paragraph("PROGRESS REPORT", self.styles['CustomTitle']))
        story.append(Spacer(1, 0.3*inch))
        
        # Report Info
        report_info = [
            ['Trainee Name:', trainee_name],
            ['Report Period:', f"{date_range_start.strftime('%B %d, %Y')} to {date_range_end.strftime('%B %d, %Y')}"],
            ['Generated:', datetime.now().strftime("%B %d, %Y")],
        ]
        
        report_table = Table(report_info, colWidths=[2*inch, 4*inch])
        report_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey)
        ]))
        story.append(report_table)
        story.append(Spacer(1, 0.2*inch))
        
        # Executive Summary
        story.append(Paragraph("EXECUTIVE SUMMARY", self.styles['CustomHeading']))
        
        pass_rate = (passed_sessions / total_sessions * 100) if total_sessions > 0 else 0
        summary_text = f"""
        During the reporting period, {trainee_name} completed <b>{total_sessions}</b> practice sessions
        with an average score of <b>{average_score:.1f}%</b>. The pass rate was <b>{pass_rate:.1f}%</b>
        ({passed_sessions} passed, {failed_sessions} marked for improvement).
        """
        story.append(Paragraph(summary_text, self.styles['Normal']))
        story.append(Spacer(1, 0.1*inch))
        
        # Summary Statistics
        summary_stats = [
            ['Metric', 'Value'],
            ['Total Sessions', str(total_sessions)],
            ['Sessions Passed', str(passed_sessions)],
            ['Sessions for Improvement', str(failed_sessions)],
            ['Pass Rate', f"{pass_rate:.1f}%"],
            ['Average Score', f"{average_score:.1f}%"]
        ]
        
        stats_table = Table(summary_stats, colWidths=[2.5*inch, 2.5*inch])
        stats_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#007BFF')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')])
        ]))
        story.append(stats_table)
        story.append(Spacer(1, 0.2*inch))
        
        # Scenarios Completed
        if scenarios_completed:
            story.append(Paragraph("SCENARIOS COMPLETED", self.styles['CustomHeading']))
            for scenario in scenarios_completed:
                story.append(Paragraph(f"• {scenario}", self.styles['Normal']))
            story.append(Spacer(1, 0.1*inch))
        
        # Strengths
        if strengths:
            story.append(Paragraph("STRENGTHS", self.styles['CustomHeading']))
            for strength in strengths:
                story.append(Paragraph(f"✓ {strength}", self.styles['Normal']))
            story.append(Spacer(1, 0.1*inch))
        
        # Areas for Improvement
        if weaknesses:
            story.append(Paragraph("AREAS FOR IMPROVEMENT", self.styles['CustomHeading']))
            for weakness in weaknesses:
                story.append(Paragraph(f"• {weakness}", self.styles['Normal']))
            story.append(Spacer(1, 0.1*inch))
        
        # Recommendations
        story.append(Paragraph("RECOMMENDATIONS", self.styles['CustomHeading']))
        recommendations = [
            "Continue practicing scenarios that showed lower scores",
            "Focus on incorporating required keywords naturally",
            "Record and listen to your practice sessions to improve clarity",
            "Review trainer feedback regularly"
        ]
        for rec in recommendations:
            story.append(Paragraph(f"• {rec}", self.styles['Normal']))
        
        # Footer
        story.append(Spacer(1, 0.3*inch))
        story.append(Paragraph(
            f"<i>This report was automatically generated. For detailed feedback, please consult with your trainer.</i>",
            self.styles['MetricLabel']
        ))
        
        # Build PDF
        doc = SimpleDocTemplate(
            self.buffer,
            pagesize=letter,
            rightMargin=0.75*inch,
            leftMargin=0.75*inch,
            topMargin=0.75*inch,
            bottomMargin=0.75*inch,
            title="Progress Report"
        )
        
        doc.build(story)
        self.buffer.seek(0)
        return self.buffer

    def generate_trainer_batch_report(
        self,
        *,
        batch_name: str,
        wave_number: Optional[int],
        report_period: str,
        generated_at: datetime,
        focus_metric: str,
        total_trainees: int,
        total_sessions: int,
        average_score: float,
        pass_rate: float,
        average_pronunciation: float,
        improvement_rows: List[Dict[str, Any]],
        pronunciation_rows: List[Dict[str, Any]],
        ranking_rows: List[Dict[str, Any]],
    ) -> BytesIO:
        story = []

        self._append_st_peter_header(
            story,
            report_title="Performance Report",
            report_subtitle="Batch / Wave Progress Report",
        )

        batch_label = batch_name
        if wave_number:
            batch_label = f"{batch_name} (Wave {wave_number})"

        report_info = [
            ['Batch / Wave:', batch_label],
            ['Report Period:', report_period],
            ['Focus Metric:', focus_metric],
            ['Generated:', generated_at.strftime("%B %d, %Y at %I:%M %p")],
        ]

        report_table = Table(report_info, colWidths=[1.8 * inch, 4.4 * inch])
        report_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey),
        ]))
        story.append(report_table)
        story.append(Spacer(1, 0.2 * inch))

        story.append(Paragraph("EXECUTIVE SUMMARY", self.styles['CustomHeading']))
        story.append(
            Paragraph(
                (
                    f"This batch report covers <b>{total_trainees}</b> trainees with "
                    f"<b>{total_sessions}</b> saved practice sessions. The average score is "
                    f"<b>{average_score:.1f}%</b> with a pass rate of <b>{pass_rate:.1f}%</b>. "
                    f"Average pronunciation accuracy is <b>{average_pronunciation:.1f}%</b>."
                ),
                self.styles['Normal'],
            )
        )
        story.append(Spacer(1, 0.15 * inch))

        summary_table = Table(
            [
                ['Metric', 'Value'],
                ['Total Trainees', str(total_trainees)],
                ['Total Sessions', str(total_sessions)],
                ['Average Score', f"{average_score:.1f}%"],
                ['Pass Rate', f"{pass_rate:.1f}%"],
                ['Avg. Pronunciation', f"{average_pronunciation:.1f}%"],
            ],
            colWidths=[3.0 * inch, 2.2 * inch],
        )
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#007BFF')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')]),
        ]))
        story.append(summary_table)
        story.append(Spacer(1, 0.2 * inch))

        if improvement_rows:
            story.append(Paragraph("IMPROVEMENT PRIORITIES", self.styles['CustomHeading']))
            improvement_table = Table(
                [
                    ['Category', 'Average', 'Below 70', 'Recommendation'],
                    *[
                        [
                            row['category'],
                            f"{float(row['average']):.1f}%",
                            str(int(row['below_threshold_count'])),
                            row['recommendation'],
                        ]
                        for row in improvement_rows
                    ],
                ],
                colWidths=[1.65 * inch, 0.8 * inch, 0.9 * inch, 3.15 * inch],
                repeatRows=1,
            )
            improvement_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0F172A')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('GRID', (0, 0), (-1, -1), 1, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ]))
            story.append(improvement_table)
            story.append(Spacer(1, 0.2 * inch))

        story.append(Paragraph("COMMON PRONUNCIATION ERRORS", self.styles['CustomHeading']))
        if pronunciation_rows:
            pronunciation_table = Table(
                [
                    ['Error Type', 'Frequency', 'Examples'],
                    *[
                        [
                            row['error_type'],
                            str(int(row['frequency'])),
                            ', '.join(row['examples']) if row['examples'] else 'No sample words',
                        ]
                        for row in pronunciation_rows
                    ],
                ],
                colWidths=[1.75 * inch, 0.8 * inch, 3.95 * inch],
                repeatRows=1,
            )
            pronunciation_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#007BFF')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('GRID', (0, 0), (-1, -1), 1, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ]))
            story.append(pronunciation_table)
        else:
            story.append(Paragraph("No pronunciation error data was available for the selected report period.", self.styles['Normal']))
        story.append(Spacer(1, 0.2 * inch))

        story.append(Paragraph("TRAINEE RANKING SNAPSHOT", self.styles['CustomHeading']))
        if ranking_rows:
            ranking_table = Table(
                [
                    ['Trainee', 'Sessions', 'Average', 'Highest', 'Passed'],
                    *[
                        [
                            row['trainee_name'],
                            str(int(row['sessions_count'])),
                            f"{float(row['average_score']):.1f}%",
                            f"{float(row['highest_score']):.1f}%",
                            str(int(row['pass_sessions'])),
                        ]
                        for row in ranking_rows
                    ],
                ],
                colWidths=[2.4 * inch, 0.8 * inch, 0.8 * inch, 0.8 * inch, 0.8 * inch],
                repeatRows=1,
            )
            ranking_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0F172A')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (1, 1), (-1, -1), 'CENTER'),
                ('GRID', (0, 0), (-1, -1), 1, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ]))
            story.append(ranking_table)
        else:
            story.append(Paragraph("No trainee ranking rows were available for the selected report period.", self.styles['Normal']))

        story.append(Spacer(1, 0.25 * inch))
        story.append(
            Paragraph(
                "<i>Generated from trainer analytics data stored in the active platform database.</i>",
                self.styles['MetricLabel'],
            )
        )

        doc = SimpleDocTemplate(
            self.buffer,
            pagesize=letter,
            rightMargin=0.6 * inch,
            leftMargin=0.6 * inch,
            topMargin=0.65 * inch,
            bottomMargin=0.65 * inch,
            title=self.title,
        )
        doc.build(story)
        self.buffer.seek(0)
        return self.buffer

    def generate_trainer_trainee_report(
        self,
        *,
        trainee_name: str,
        trainee_email: str,
        report_period: str,
        generated_at: datetime,
        focus_metric: str,
        overall_metrics: Dict[str, Any],
        category_breakdown: List[Dict[str, Any]],
        recent_sessions: List[Dict[str, Any]],
        weak_areas: List[Dict[str, Any]],
    ) -> BytesIO:
        story = []

        self._append_st_peter_header(
            story,
            report_title="Performance Report",
            report_subtitle="Specific Trainee Progress Report",
        )

        report_info = [
            ['Trainee Name:', trainee_name],
            ['Email:', trainee_email],
            ['Report Period:', report_period],
            ['Focus Metric:', focus_metric],
            ['Generated:', generated_at.strftime("%B %d, %Y at %I:%M %p")],
        ]
        report_table = Table(report_info, colWidths=[1.7 * inch, 4.5 * inch])
        report_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey),
        ]))
        story.append(report_table)
        story.append(Spacer(1, 0.2 * inch))

        summary_table = Table(
            [
                ['Metric', 'Value'],
                ['Total Sessions', str(int(overall_metrics.get('total_sessions', 0)))],
                ['Average Score', f"{float(overall_metrics.get('average_score', 0)):.1f}%"],
                ['Highest Score', f"{float(overall_metrics.get('highest_score', 0)):.1f}%"],
                ['Lowest Score', f"{float(overall_metrics.get('lowest_score', 0)):.1f}%"],
                ['Pass Rate', f"{float(overall_metrics.get('pass_rate', 0)):.1f}%"],
            ],
            colWidths=[3.0 * inch, 2.2 * inch],
        )
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#007BFF')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')]),
        ]))
        story.append(Paragraph("OVERALL PERFORMANCE", self.styles['CustomHeading']))
        story.append(summary_table)
        story.append(Spacer(1, 0.2 * inch))

        if category_breakdown:
            story.append(Paragraph("CATEGORY BREAKDOWN", self.styles['CustomHeading']))
            category_table = Table(
                [
                    ['Category', 'Average', 'Highest', 'Lowest'],
                    *[
                        [
                            row['category'],
                            f"{float(row['average']):.1f}%",
                            f"{float(row['highest']):.1f}%",
                            f"{float(row['lowest']):.1f}%",
                        ]
                        for row in category_breakdown
                    ],
                ],
                colWidths=[2.7 * inch, 1.0 * inch, 1.0 * inch, 1.0 * inch],
                repeatRows=1,
            )
            category_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0F172A')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (1, 1), (-1, -1), 'CENTER'),
                ('GRID', (0, 0), (-1, -1), 1, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
            ]))
            story.append(category_table)
            story.append(Spacer(1, 0.2 * inch))

        story.append(Paragraph("NEEDS IMPROVEMENT", self.styles['CustomHeading']))
        if weak_areas:
            weak_area_table = Table(
                [
                    ['Area', 'Score', 'Recommendation'],
                    *[
                        [
                            row['category'],
                            f"{float(row['score']):.1f}%",
                            row['recommendation'],
                        ]
                        for row in weak_areas
                    ],
                ],
                colWidths=[1.5 * inch, 0.8 * inch, 4.0 * inch],
                repeatRows=1,
            )
            weak_area_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#007BFF')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('GRID', (0, 0), (-1, -1), 1, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
            ]))
            story.append(weak_area_table)
        else:
            story.append(Paragraph("No sub-threshold skill areas were detected for the selected report period.", self.styles['Normal']))
        story.append(Spacer(1, 0.2 * inch))

        story.append(Paragraph("RECENT SESSIONS", self.styles['CustomHeading']))
        if recent_sessions:
            recent_sessions_table = Table(
                [
                    ['Date', 'Scenario', 'Score', 'Status'],
                    *[
                        [
                            row.get('date_label', ''),
                            row['scenario'],
                            f"{float(row['score']):.1f}%",
                            row['status'],
                        ]
                        for row in recent_sessions
                    ],
                ],
                colWidths=[1.3 * inch, 3.0 * inch, 0.8 * inch, 1.1 * inch],
                repeatRows=1,
            )
            recent_sessions_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0F172A')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (2, 1), (3, -1), 'CENTER'),
                ('GRID', (0, 0), (-1, -1), 1, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
            ]))
            story.append(recent_sessions_table)
        else:
            story.append(Paragraph("No recent sessions were available for the selected report period.", self.styles['Normal']))

        story.append(Spacer(1, 0.25 * inch))
        story.append(
            Paragraph(
                "<i>Generated from trainer analytics data stored in the active platform database.</i>",
                self.styles['MetricLabel'],
            )
        )

        doc = SimpleDocTemplate(
            self.buffer,
            pagesize=letter,
            rightMargin=0.6 * inch,
            leftMargin=0.6 * inch,
            topMargin=0.65 * inch,
            bottomMargin=0.65 * inch,
            title=self.title,
        )
        doc.build(story)
        self.buffer.seek(0)
        return self.buffer

    @staticmethod
    def _score_to_badge(score: float) -> str:
        """Convert score to badge text"""
        if score >= 85:
            return "Excellent"
        elif score >= 70:
            return "Good"
        elif score >= 50:
            return "Fair"
        else:
            return "Needs Work"
    
    @staticmethod
    def _get_score_interpretation(score: float) -> str:
        """Get interpretation text for overall score"""
        if score >= 85:
            return "Excellent Performance - Ready for advancement"
        elif score >= 75:
            return "Good Performance - On track for success"
        elif score >= 60:
            return "Satisfactory Performance - Continue practicing"
        else:
            return "Performance Needs Improvement - Additional practice recommended"
    
    @staticmethod
    def _generate_recommendations(scores: Dict[str, float], overall_score: float) -> List[str]:
        """Generate personalized recommendations based on scores"""
        recommendations = []
        
        if scores.get('accuracy', 0) < 70:
            recommendations.append("Focus on accurate pronunciation of key terms")
        
        if scores.get('fluency', 0) < 70:
            recommendations.append("Practice maintaining a steady pace without long pauses")
        
        if scores.get('clarity', 0) < 70:
            recommendations.append("Work on clear enunciation and volume control")
        
        if scores.get('keyword_adherence', 0) < 70:
            recommendations.append("Incorporate required keywords more naturally into responses")
        
        if scores.get('soft_skills', 0) < 70:
            recommendations.append("Practice empathy and engagement techniques")
        
        if not recommendations:
            recommendations.append("Excellent work! Continue maintaining these high standards.")
        
        return recommendations
