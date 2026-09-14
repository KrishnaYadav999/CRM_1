function money(value) {
  return `INR ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function downloadBlob(buffer, type, fileName) {
  const blob = new Blob([buffer], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function safeDate(value) {
  return String(value || '').replace(/[^0-9-]/g, '')
}

export async function exportSalesManagementExcel(data) {
  const module = await import('exceljs')
  const ExcelJS = module.default || module
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'AnantTattva CRM'
  workbook.created = new Date()

  const summary = workbook.addWorksheet('Executive Summary')
  summary.columns = [{ width: 32 }, { width: 24 }, { width: 60 }]
  summary.addRow(['Sales Team Management Details Report'])
  summary.mergeCells('A1:C1')
  summary.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } }
  summary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF087A70' } }
  summary.addRow(['Period', `${data.meta?.dateFrom || ''} to ${data.meta?.dateTo || ''}`])
  summary.addRow([])
  summary.addRow(['Metric', 'Value', 'Definition'])
  summary.addRows([
    ['Total Leads', data.summary?.totalLeads || 0, 'Leads created in the selected period'],
    ['Conversion Rate', `${data.summary?.conversionRate || 0}%`, data.meta?.definitions?.conversion || ''],
    ['Confirmed PO Revenue', Number(data.summary?.confirmedRevenue || 0), data.meta?.definitions?.revenue || ''],
    ['Closed Service Deals', data.summary?.closedDeals || 0, data.meta?.definitions?.closedDeal || ''],
    ['Approved Quotation Value', Number(data.summary?.approvedQuotationValue || 0), data.meta?.definitions?.quotationValue || '']
  ])
  summary.addRow([])
  summary.addRow(['At-Risk Indicators'])
  summary.addRow(['Stalled Quotations', data.riskIndicators?.stalledQuotations || 0, 'Awaiting action for more than 30 days'])
  summary.addRow(['Low-Conversion Managers', data.riskIndicators?.lowConversionManagers || 0])
  summary.addRow(['Overdue Follow-Ups', data.riskIndicators?.overdueFollowUps || 0])
  summary.addRow([])
  summary.addRow(['Top 3 Performing Managers'])
  ;(data.insights?.topManagers || []).forEach((row, index) => summary.addRow([`${index + 1}. ${row.managerName}`, `${row.conversionRate}%`, money(row.confirmedRevenue)]))
  summary.addRow([])
  summary.addRow(['Recommendations'])
  ;(data.insights?.recommendations || []).forEach((item) => summary.addRow([item]))
  summary.getColumn(2).numFmt = '#,##0.00'

  const managers = workbook.addWorksheet('Lead Owner Performance')
  managers.columns = [
    { header: 'Lead Owner', key: 'leadOwnerName', width: 28 }, { header: 'Reporting Manager', key: 'reportingManagerName', width: 28 },
    { header: 'Role', key: 'role', width: 18 },
    { header: 'Department', key: 'department', width: 22 }, { header: 'Total Leads', key: 'totalLeads', width: 14 },
    { header: 'Open Quotations', key: 'openQuotations', width: 18 }, { header: 'Approved Quotations', key: 'approvedQuotations', width: 20 },
    { header: 'Converted Leads', key: 'convertedToSale', width: 17 }, { header: 'Closed Service Deals', key: 'closedDeals', width: 20 },
    { header: 'Conversion %', key: 'conversionRate', width: 15 }, { header: 'Approved Quote Value', key: 'approvedQuotationValue', width: 22 },
    { header: 'Approved PO Value', key: 'confirmedRevenue', width: 20 }, { header: 'Status', key: 'status', width: 14 }
  ]
  managers.addRows(data.managerPerformance || [])
  managers.getColumn('approvedQuotationValue').numFmt = '#,##0.00'
  managers.getColumn('confirmedRevenue').numFmt = '#,##0.00'

  const trend = workbook.addWorksheet('Monthly Trend')
  trend.columns = [
    { header: 'Month', key: 'month', width: 14 }, { header: 'Open', key: 'open', width: 12 },
    { header: 'Quotation Open', key: 'quotationOpen', width: 18 }, { header: 'Quotation Approved', key: 'quotationApproved', width: 21 },
    { header: 'Converted / Closed', key: 'converted', width: 20 }, { header: 'Quotation Closed', key: 'quotationClosed', width: 20 },
    { header: 'Conversion %', key: 'conversionRate', width: 16 }
  ]
  trend.addRows(data.monthlyTrend || [])

  const departments = workbook.addWorksheet('Department Breakdown')
  departments.columns = [
    { header: 'Department', key: 'department', width: 24 }, { header: 'Lead Count', key: 'leadCount', width: 14 },
    { header: 'Conversion %', key: 'conversionRate', width: 16 }, { header: 'Average Deal Value', key: 'avgDealValue', width: 21 },
    { header: 'Approved Quote Value', key: 'approvedQuotationValue', width: 22 }, { header: 'Target', key: 'target', width: 16 },
    { header: 'Actual Revenue', key: 'actual', width: 20 }
  ]
  departments.addRows(data.departmentBreakdown || [])
  ;[summary, managers, trend, departments].forEach((sheet) => {
    const headerRow = sheet === summary ? sheet.getRow(4) : sheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF087A70' } }
    sheet.views = [{ state: 'frozen', ySplit: sheet === summary ? 4 : 1 }]
  })
  downloadBlob(
    await workbook.xlsx.writeBuffer(),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    `sales-management-${safeDate(data.meta?.dateFrom)}-${safeDate(data.meta?.dateTo)}.xlsx`
  )
}

export async function exportSalesManagementPdf(data) {
  const [{ jsPDF }, tableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = tableModule.default || tableModule.autoTable
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  pdf.setFillColor(8, 122, 112)
  pdf.rect(0, 0, 297, 29, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(18)
  pdf.text('Sales Team Management Details Report', 10, 13)
  pdf.setFontSize(9)
  pdf.text(`${data.meta?.dateFrom || ''} to ${data.meta?.dateTo || ''} | Generated ${new Date().toLocaleString('en-IN')}`, 10, 21)
  pdf.setTextColor(15, 23, 42)
  autoTable(pdf, {
    startY: 35,
    head: [['Total Leads', 'Conversion Rate', 'Confirmed PO Revenue', 'Closed Service Deals', 'Approved Quote Value']],
    body: [[data.summary?.totalLeads || 0, `${data.summary?.conversionRate || 0}%`, money(data.summary?.confirmedRevenue), data.summary?.closedDeals || 0, money(data.summary?.approvedQuotationValue)]],
    headStyles: { fillColor: [16, 185, 129] }
  })
  autoTable(pdf, {
    startY: pdf.lastAutoTable.finalY + 8,
    head: [['Lead Owner', 'Reports To', 'Department', 'Leads', 'Open Quotes', 'Approved Quotes', 'Converted', 'Conv. %', 'Approved PO Value']],
    body: (data.managerPerformance || []).map((row) => [row.leadOwnerName || row.managerName, row.reportingManagerName || '-', row.department, row.totalLeads, row.openQuotations, row.approvedQuotations, row.convertedToSale, `${row.conversionRate}%`, money(row.confirmedRevenue)]),
    headStyles: { fillColor: [8, 122, 112] }, styles: { fontSize: 8 }, alternateRowStyles: { fillColor: [240, 253, 250] }
  })
  pdf.addPage()
  pdf.setFontSize(15)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Monthly Lead Carry-Forward', 10, 14)
  autoTable(pdf, {
    startY: 20,
    head: [['Month', 'Opening Pending', 'New Leads', 'Total Available', 'Closed From Opening', 'Closed From New', 'Total Closed', 'Closing Pending']],
    body: (data.monthlyCarryForward || []).map((row) => [row.month, row.openingPending, row.newLeads, row.totalAvailable, row.closedFromOpening, row.closedFromNew, row.closedThisMonth, row.closingPending]),
    headStyles: { fillColor: [245, 158, 11], textColor: [69, 26, 3] }
  })
  pdf.setFontSize(13)
  pdf.text('Pipeline Trend', 10, pdf.lastAutoTable.finalY + 7)
  autoTable(pdf, {
    startY: pdf.lastAutoTable.finalY + 11,
    head: [['Month', 'Open', 'Quote Open', 'Quote Approved', 'Converted / Closed', 'Quote Closed', 'Conversion %']],
    body: (data.monthlyTrend || []).map((row) => [row.month, row.open, row.quotationOpen, row.quotationApproved, row.converted, row.quotationClosed, `${row.conversionRate}%`]),
    headStyles: { fillColor: [16, 185, 129] }
  })
  autoTable(pdf, {
    startY: pdf.lastAutoTable.finalY + 8,
    head: [['Department', 'Leads', 'Conversion %', 'Average Deal', 'Approved Quote Value', 'Actual Revenue', 'Target']],
    body: (data.departmentBreakdown || []).map((row) => [row.department, row.leadCount, `${row.conversionRate}%`, money(row.avgDealValue), money(row.approvedQuotationValue), money(row.actual), row.target ?? 'Not configured']),
    headStyles: { fillColor: [8, 122, 112] }
  })
  const recommendationY = Math.min(190, pdf.lastAutoTable.finalY + 10)
  pdf.setFontSize(12)
  pdf.text('Recommendations', 10, recommendationY)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  ;(data.insights?.recommendations || []).forEach((item, index) => pdf.text(`- ${item}`, 12, recommendationY + 7 + (index * 6)))
  pdf.save(`sales-management-${safeDate(data.meta?.dateFrom)}-${safeDate(data.meta?.dateTo)}.pdf`)
}

export async function exportQuotationMisPdf(quotations = [], period = {}) {
  const [{ jsPDF }, tableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = tableModule.default || tableModule.autoTable
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  const rows = [...quotations].sort((left, right) => new Date(right.quotationDate || right.createdAt || 0) - new Date(left.quotationDate || left.createdAt || 0))
  const approved = rows.filter((row) => String(row.status || '').toLowerCase() === 'approved')
  pdf.setFillColor(8, 122, 112)
  pdf.rect(0, 0, 297, 29, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(18)
  pdf.text('Quotation Management MIS', 10, 13)
  pdf.setFontSize(9)
  pdf.text(`${period.dateFrom || ''} to ${period.dateTo || ''} | Generated ${new Date().toLocaleString('en-IN')}`, 10, 21)
  pdf.setTextColor(15, 23, 42)
  autoTable(pdf, {
    startY: 35,
    head: [['Total Quotations', 'Approved', 'Open', 'Rejected', 'Approved Quote Value']],
    body: [[
      rows.length,
      approved.length,
      rows.filter((row) => ['draft', 'submitted', 'sent'].includes(String(row.status || '').toLowerCase())).length,
      rows.filter((row) => String(row.status || '').toLowerCase() === 'rejected').length,
      money(approved.reduce((sum, row) => sum + (Number(row.grandTotal) || 0), 0))
    ]],
    headStyles: { fillColor: [16, 185, 129] }
  })
  autoTable(pdf, {
    startY: pdf.lastAutoTable.finalY + 8,
    head: [['Quotation', 'Company', 'Prepared By', 'Status', 'Date', 'Quote Value']],
    body: rows.map((row) => [
      row.quotationNumber || '-', row.companyName || row.leadDetails?.companyName || '-',
      row.preparedBy || row.createdByName || '-', row.status || 'draft',
      row.quotationDate || row.createdAt ? new Date(row.quotationDate || row.createdAt).toLocaleDateString('en-IN') : '-',
      money(row.grandTotal)
    ]),
    headStyles: { fillColor: [8, 122, 112] }, styles: { fontSize: 8 }, alternateRowStyles: { fillColor: [240, 253, 250] }
  })
  pdf.save(`quotation-mis-${safeDate(period.dateFrom)}-${safeDate(period.dateTo)}.pdf`)
}
