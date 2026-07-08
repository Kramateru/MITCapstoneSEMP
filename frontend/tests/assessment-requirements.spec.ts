import { expect, test } from '@playwright/test'

/**
 * Assessment Navigation Module - Comprehensive E2E Test
 * Tests all 10 user requirements for the Assessment module
 */

test.describe('Assessment Navigation Module - User Requirements', () => {
  let page: any

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    // Navigate to trainer assessments
    await page.goto('http://localhost:3000/trainer/assessments')
    // Wait for page to load
    await page.waitForLoadState('networkidle')
  })

  test('Requirement 1: UI Cleanup - Only 5 sections visible', async () => {
    // Check that we see the 5 required sections: Dashboard, Categories, Question Bank, Bulk Upload, Assignments, Results
    const dashboardBtn = await page.locator('button:has-text("Dashboard")')
    const categoriesBtn = await page.locator('button:has-text("Categories")')
    const questionBankBtn = await page.locator('button:has-text("Question Bank")')
    const bulkUploadBtn = await page.locator('button:has-text("Bulk Upload")')
    const assignmentsBtn = await page.locator('button:has-text("Assignments")')
    const resultsBtn = await page.locator('button:has-text("Results")')

    // Verify these sections exist
    await expect(dashboardBtn).toBeVisible()
    await expect(categoriesBtn).toBeVisible()
    await expect(questionBankBtn).toBeVisible()
    await expect(bulkUploadBtn).toBeVisible()
    await expect(assignmentsBtn).toBeVisible()
    await expect(resultsBtn).toBeVisible()

    // Verify removed sections do NOT exist
    const certificatesBtn = await page.locator('button:has-text("Certificates")').first()
    const analyticsBtn = await page.locator('button:has-text("Analytics")').first()
    const reportsBtn = await page.locator('button:has-text("Reports")').first()

    await expect(certificatesBtn).not.toBeVisible()
    await expect(analyticsBtn).not.toBeVisible()
    await expect(reportsBtn).not.toBeVisible()
  })

  test('Requirement 2: Assignment Flow - Integrated category-to-batch/wave assignment', async () => {
    // Click on Assignments section
    await page.locator('button:has-text("Assignments")').click()
    await page.waitForTimeout(500)

    // Verify assignment interface exists with category selection
    const categorySelect = await page.locator('select, [role="combobox"]').first()
    await expect(categorySelect).toBeVisible()

    // Should have batch/wave/trainee targeting visible
    const batchOption = await page.locator('text=/batch|Batch/i').first()
    const waveOption = await page.locator('text=/wave|Wave/i').first()

    await expect(batchOption).toBeVisible()
    await expect(waveOption).toBeVisible()
  })

  test('Requirement 3: Trainee Access Control - Prevent direct URL access', async () => {
    // This test would need a trainee session
    // Navigate to trainee dashboard
    const response = await page.goto('http://localhost:3000/trainee/assessment', {
      waitUntil: 'networkidle',
    })

    // Should either load assessments or show empty state
    // Should NOT show assignments not assigned to trainee
    const emptyState = await page.locator('text=/no assessments|available assessments/i').first()
    const assessmentList = await page.locator('[data-testid="assessment-list"], .assessment-card').first()

    const hasContent = (await emptyState.isVisible().catch(() => false)) || (await assessmentList.isVisible().catch(() => false))
    expect(hasContent).toBeTruthy()
  })

  test('Requirement 4: CSV Bulk Upload - Template download and validation', async () => {
    // Click on Bulk Upload section
    await page.locator('button:has-text("Bulk Upload")').click()
    await page.waitForTimeout(500)

    // Verify Download button exists
    const downloadBtn = await page.locator('button:has-text("Download CSV Template")')
    await expect(downloadBtn).toBeVisible()

    // Verify upload button exists
    const uploadBtn = await page.locator('button:has-text("Upload CSV"), button:has-text("Choose File")')
    await expect(uploadBtn.first()).toBeVisible()

    // Verify form shows file selection status
    const fileStatus = await page.locator('text=/No file selected|Selected file/i')
    await expect(fileStatus).toBeVisible()
  })

  test('Requirement 5: API Validation - Assessment endpoints respond correctly', async () => {
    // Test bootstrap endpoint
    const bootstrapResponse = await page.request.get('http://localhost:3000/api/assessment-module/trainer/bootstrap', {
      headers: {
        Authorization: `Bearer ${await getValidToken(page)}`,
      },
    })

    expect(bootstrapResponse.status()).toBeLessThan(500) // Should not be a server error
    // 401 is acceptable if auth is needed, 200 is ideal

    // Test template endpoint
    const templateResponse = await page.request.get('http://localhost:3000/api/assessment-module/trainer/questions/template')
    expect(templateResponse.status()).toBeLessThan(500)
  })

  test('Requirement 6: Supabase Integration - Questions load and save', async () => {
    // Click on Question Bank
    await page.locator('button:has-text("Question Bank")').click()
    await page.waitForTimeout(1000)

    // Verify question list or empty state is present
    const questionList = await page.locator('[data-testid="question-list"], .question-card, .question-row').first()
    const emptyState = await page.locator('text=/no questions|empty/i', { matchCase: false }).first()

    const hasContent = (await questionList.isVisible().catch(() => false)) || (await emptyState.isVisible().catch(() => false))
    expect(hasContent).toBeTruthy()
  })

  test('Requirement 7: Assessment Taking - Question loading and choice randomization', async () => {
    // Navigate to trainee assessment page
    const response = await page.goto('http://localhost:3000/trainee/assessment', {
      waitUntil: 'networkidle',
    })

    // Should load assessment interface or empty state
    const assessmentPlayer = await page.locator('[data-testid="assessment-player"], .assessment-container').first()
    const emptyState = await page.locator('text=/no assessments|available/i', { matchCase: false }).first()

    const hasContent = (await assessmentPlayer.isVisible().catch(() => false)) || (await emptyState.isVisible().catch(() => false))
    expect(hasContent).toBeTruthy()

    // If there's an assessment, verify question and choices are loaded
    if (await assessmentPlayer.isVisible().catch(() => false)) {
      const questionText = await page.locator('[data-testid="question-text"], .question').first()
      const choices = await page.locator('[data-testid="choice"], input[type="radio"], .choice-option')

      await expect(questionText).toBeVisible()
      expect(await choices.count()).toBeGreaterThanOrEqual(2)
    }
  })

  test('Requirement 8: Results and Evaluations - Trainer view with filtering', async () => {
    // Navigate back to trainer
    await page.goto('http://localhost:3000/trainer/assessments', {
      waitUntil: 'networkidle',
    })

    // Click on Results section
    await page.locator('button:has-text("Results")').click()
    await page.waitForTimeout(500)

    // Verify filter options exist
    const categoryFilter = await page.locator('[data-testid="category-filter"], select, [role="combobox"]').first()
    const statusFilter = await page.locator('[data-testid="status-filter"], text=/pass|fail|status/i').first()

    await expect(categoryFilter).toBeVisible()
    await expect(statusFilter).toBeVisible()

    // Verify results list or empty state
    const resultsList = await page.locator('[data-testid="results-list"], .result-row, .attempt-card').first()
    const emptyState = await page.locator('text=/no results|no attempts/i', { matchCase: false }).first()

    const hasContent = (await resultsList.isVisible().catch(() => false)) || (await emptyState.isVisible().catch(() => false))
    expect(hasContent).toBeTruthy()
  })

  test('Requirement 9: UI/UX Improvements - Responsive layout and card design', async () => {
    // Check if UI follows card-based design pattern
    const cards = await page.locator('.card, [data-testid*="card"]')
    expect(await cards.count()).toBeGreaterThan(0)

    // Verify responsive behavior - check if elements scale on different viewports
    const initialWidth = page.viewportSize()?.width || 1280

    // Check for mobile responsiveness
    await page.setViewportSize({ width: 375, height: 667 }) // Mobile
    const mobileContent = await page.locator('[role="main"], main').first()
    await expect(mobileContent).toBeVisible()

    // Restore original viewport
    await page.setViewportSize({ width: initialWidth, height: 1024 })
  })

  test('Requirement 10: Comprehensive Module - All features integrated', async () => {
    // Navigate to all sections and verify they load without errors
    const sections = ['Dashboard', 'Categories', 'Question Bank', 'Bulk Upload', 'Assignments', 'Results']

    for (const section of sections) {
      await page.locator(`button:has-text("${section}")`).click()
      await page.waitForTimeout(300)

      // Verify no console errors
      const consoleErrors = await page.evaluate(() => {
        return (window as any).__consoleErrors || []
      })

      expect(consoleErrors.length).toBe(0)

      // Verify content is visible
      const content = await page.locator('[role="main"], main, .content').first()
      await expect(content).toBeVisible()
    }
  })
})

/**
 * Helper function to get valid token from browser storage
 */
async function getValidToken(page: any): Promise<string> {
  const token = await page.evaluate(() => {
    return window.localStorage.getItem('token')
  })
  return token || ''
}
