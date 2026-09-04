const REPORT_TITLE = 'User Activity & Productivity Report'

export function formatDuration(seconds = 0) {
  const total = Math.max(0, Number(seconds) || 0)
  return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`
}

export function formatReportDate(value) {
  if (!value) return '-'
  return new Date(`${value}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

export function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

async function logoDataUrl() {
  const response = await fetch('/ananttattva-logo.png')
  if (!response.ok) throw new Error('Company logo could not be loaded')
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function drawKpiCards(pdf, cards, startY) {
  const margin = 9
  const gap = 3
  const cardWidth = (297 - margin * 2 - gap * 3) / 4
  cards.forEach((card, index) => {
    const column = index % 4
    const row = Math.floor(index / 4)
    const x = margin + column * (cardWidth + gap)
    const y = startY + row * 17
    pdf.setFillColor(index === 6 ? 236 : 248, index === 6 ? 253 : 250, index === 6 ? 245 : 252)
    pdf.setDrawColor(index === 6 ? 167 : 220, index === 6 ? 243 : 230, index === 6 ? 208 : 233)
    pdf.roundedRect(x, y, cardWidth, 13.5, 2, 2, 'FD')
    pdf.setTextColor(71, 85, 105)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(6.5)
    pdf.text(card.label.toUpperCase(), x + 3, y + 4.2)
    pdf.setTextColor(7, 88, 72)
    pdf.setFontSize(12)
    pdf.text(String(card.value), x + 3, y + 10.5)
  })
}

export async function downloadProductivityPdf({ rows, summary, period, insights }) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = autoTableModule.default || autoTableModule.autoTable
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  const teal = [7, 88, 72]
  const orange = [249, 115, 22]
  let logo = null
  try { logo = await logoDataUrl() } catch (error) { console.warn('PDF logo unavailable', error) }

  pdf.setFillColor(243, 248, 246)
  pdf.rect(0, 0, 297, 31, 'F')
  if (logo) {
    const image = pdf.getImageProperties(logo)
    const maxWidth = 42
    const maxHeight = 16
    const ratio = Math.min(maxWidth / image.width, maxHeight / image.height)
    pdf.addImage(logo, 'PNG', 10, 7, image.width * ratio, image.height * ratio, undefined, 'FAST')
  }
  pdf.setTextColor(...teal)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text('ANANTTATTVA', 63, 8.5)
  pdf.setFontSize(18)
  pdf.text(REPORT_TITLE, 63, 15.5)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(71, 85, 105)
  pdf.setFontSize(8.5)
  pdf.text(`Report Period: ${formatReportDate(period.from)} - ${formatReportDate(period.to)}`, 63, 21.5)
  pdf.text(`Generated On: ${formatDateTime(new Date())}`, 63, 26)
  pdf.setDrawColor(...orange)
  pdf.setLineWidth(1)
  pdf.line(9, 30, 288, 30)

  const cards = [
    { label: 'Total Users', value: summary.totalUsers },
    { label: 'Online Now', value: summary.onlineNow },
    { label: 'Active CRM Time', value: formatDuration(summary.activeSeconds) },
    { label: 'Away Time', value: formatDuration(summary.awaySeconds) },
    { label: 'CRM Actions', value: Number(summary.actions || 0).toLocaleString('en-IN') },
    { label: 'Closed Leads', value: summary.closedLeads },
    { label: 'Support Tickets Raised', value: summary.supportTickets },
    { label: 'Total Sessions', value: summary.totalSessions }
  ]
  drawKpiCards(pdf, cards, 35)

  pdf.setFillColor(239, 250, 247)
  pdf.setDrawColor(167, 243, 208)
  pdf.roundedRect(9, 69, 279, 20, 2, 2, 'FD')
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(...teal)
  pdf.setFontSize(8)
  pdf.text('REPORT SUMMARY & KEY INSIGHTS', 12, 74)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(51, 65, 85)
  pdf.setFontSize(7.2)
  pdf.text(`Users ${summary.totalUsers}  |  Online ${summary.onlineNow}  |  CRM Actions ${Number(summary.actions || 0).toLocaleString('en-IN')}  |  Closed Leads ${summary.closedLeads}  |  Support Tickets ${summary.supportTickets}`, 12, 79)
  const insightText = [
    `Most Active: ${insights.mostActive?.name || '-'}`,
    `Most CRM Actions: ${insights.mostActions?.name || '-'}`,
    `Highest Score: ${insights.highestScore?.name || '-'}`,
    `Most Leads: ${insights.mostLeads?.name || '-'}`,
    `Most Tickets: ${insights.mostTickets?.name || '-'}`
  ]
  pdf.text(insightText.join('   |   '), 12, 85)

  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(15, 23, 42)
  pdf.setFontSize(10)
  pdf.text(REPORT_TITLE, 9, 96)
  if (rows.length) {
    autoTable(pdf, {
      startY: 99,
      margin: { top: 12, right: 9, bottom: 14, left: 9 },
      head: [['#', 'User Name', 'Role', 'Score', 'Leads', 'Closed', 'Active', 'Away', 'Sessions', 'CRM Actions', 'Tickets', 'Risk Level / Reason']],
      body: rows.map((row, index) => [
        index + 1, row.name, row.roleLabel, `${row.score}/100`, row.totalLeads, row.closedLeads,
        formatDuration(row.activeSeconds), formatDuration(row.awaySeconds), row.sessions,
        row.activityCount, row.tickets.total, `${row.risk.level}\n${row.risk.reason}`
      ]),
      theme: 'grid',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      headStyles: { fillColor: teal, textColor: 255, fontStyle: 'bold', fontSize: 7, cellPadding: 2, valign: 'middle' },
      bodyStyles: { textColor: [51, 65, 85], fontSize: 6.8, cellPadding: 1.8, valign: 'middle', overflow: 'linebreak' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { lineColor: [203, 213, 225], lineWidth: 0.15, font: 'helvetica' },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 42 }, 2: { cellWidth: 24 },
        3: { cellWidth: 17, halign: 'center' }, 4: { cellWidth: 14, halign: 'center' },
        5: { cellWidth: 15, halign: 'center' }, 6: { cellWidth: 21, halign: 'right' },
        7: { cellWidth: 21, halign: 'right' }, 8: { cellWidth: 17, halign: 'center' },
        9: { cellWidth: 22, halign: 'right' }, 10: { cellWidth: 17, halign: 'center' },
        11: { cellWidth: 61 }
      }
    })
  } else {
    pdf.setFillColor(248, 250, 252)
    pdf.roundedRect(9, 96, 279, 22, 2, 2, 'F')
    pdf.setTextColor(100, 116, 139)
    pdf.setFontSize(10)
    pdf.text('No user activity found for the selected period.', 148.5, 108, { align: 'center' })
  }

  const pages = pdf.internal.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page)
    pdf.setDrawColor(226, 232, 240)
    pdf.line(9, 200, 288, 200)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(100, 116, 139)
    pdf.setFontSize(7)
    pdf.text('Generated from AnantTattva CRM', 9, 205)
    pdf.text(`Page ${page} of ${pages}`, 288, 205, { align: 'right' })
  }
  pdf.save(`User_Activity_Productivity_Report_${period.to}.pdf`)
}

async function createMisPdf(title, subtitle, period) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = autoTableModule.default || autoTableModule.autoTable
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
  let logo = null
  try { logo = await logoDataUrl() } catch (error) { console.warn('PDF logo unavailable', error) }
  pdf.setFillColor(243, 248, 246); pdf.rect(0, 0, 297, 32, 'F')
  if (logo) pdf.addImage(logo, 'PNG', 10, 7, 38, 14, undefined, 'FAST')
  pdf.setTextColor(7, 88, 72); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18); pdf.text(title, 58, 14)
  pdf.setTextColor(71, 85, 105); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5)
  pdf.text(`${subtitle}  |  ${formatReportDate(period.from)} - ${formatReportDate(period.to)}`, 58, 20)
  pdf.text(`Generated: ${formatDateTime(new Date())}`, 58, 25)
  pdf.setDrawColor(249, 115, 22); pdf.setLineWidth(1); pdf.line(9, 31, 288, 31)
  return { pdf, autoTable }
}

export async function downloadSalesMisPdf({ rows, period }) {
  const { pdf, autoTable } = await createMisPdf('Sales MIS Report', 'Sales lead performance', period)
  const totals = rows.reduce((sum, row) => ({ total: sum.total + Number(row.totalLeads || 0), open: sum.open + Number(row.openLeads || 0), closed: sum.closed + Number(row.closedLeads || 0) }), { total: 0, open: 0, closed: 0 })
  drawKpiCards(pdf, [{ label: 'Sales Users', value: rows.length }, { label: 'Total Leads', value: totals.total }, { label: 'Lead Open', value: totals.open }, { label: 'Lead Close', value: totals.closed }], 36)
  autoTable(pdf, { startY: 55, margin: { left: 9, right: 9 }, head: [['#', 'User Name', 'Email', 'Total Leads', 'Lead Open', 'Lead Close', 'Close Rate']], body: rows.map((row, index) => [index + 1, row.name, row.email, row.totalLeads, row.openLeads, row.closedLeads, `${row.totalLeads ? Math.round(row.closedLeads / row.totalLeads * 100) : 0}%`]), theme: 'grid', headStyles: { fillColor: [7, 88, 72], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [248, 250, 252] }, styles: { fontSize: 8, cellPadding: 2.5, lineColor: [203, 213, 225], lineWidth: 0.15 }, columnStyles: { 0: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } } })
  pdf.save(`Sales_MIS_Report_${period.to}.pdf`)
}

export async function downloadOperationMisPdf({ groups, period }) {
  const { pdf, autoTable } = await createMisPdf('Operation MIS Report', 'Team and Client Master completion', period)
  const body = groups.flatMap((group) => {
    const people = [...(group.manager ? [group.manager] : []), ...group.members]
    return [[group.name, 'TEAM TOTAL', group.manager?.name || '-', group.clientMasters, group.draftClients || 0, group.submittedClients || 0, group.pendingClients || 0, `${group.percentage}%`], ...people.map((row) => ['', row === group.manager ? 'Manager' : 'User', row.name, row.clientMasters || 0, row.draftClients || 0, row.submittedClients || 0, row.pendingClients || 0, `${row.clientCompletionPercentage || 0}%`])]
  })
  autoTable(pdf, { startY: 38, margin: { left: 9, right: 9 }, head: [['Team', 'Level', 'Reports To', 'Client Masters', 'Total Draft', 'Total Submitted', 'Pending Clients', 'Completion']], body, theme: 'grid', headStyles: { fillColor: [8, 145, 178], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [248, 250, 252] }, styles: { fontSize: 8, cellPadding: 2.5, lineColor: [203, 213, 225], lineWidth: 0.15 }, columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } }, didParseCell: (data) => { if (data.section === 'body' && data.row.raw?.[1] === 'TEAM TOTAL') { data.cell.styles.fillColor = [236, 254, 255]; data.cell.styles.fontStyle = 'bold' } } })
  pdf.save(`Operation_MIS_Report_${period.to}.pdf`)
}

export async function exportProductivityExcel({ rows, summary, period }) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  const summaryRows = [
    ['User Activity & Productivity Report'],
    ['Report Period', `${formatReportDate(period.from)} - ${formatReportDate(period.to)}`],
    ['Total Users', summary.totalUsers], ['Online Now', summary.onlineNow],
    ['Active CRM Time', formatDuration(summary.activeSeconds)], ['Away Time', formatDuration(summary.awaySeconds)],
    ['CRM Actions', summary.actions], ['Closed Leads', summary.closedLeads],
    ['Support Tickets Raised', summary.supportTickets], ['Total Sessions', summary.totalSessions]
  ]
  const reportRows = rows.map((row, index) => ({
    'Sr. No.': index + 1, 'User Name': row.name, Email: row.email, Role: row.roleLabel,
    'Productivity Score': row.score, 'Total Leads': row.totalLeads, 'Closed Leads': row.closedLeads,
    'Active Time': formatDuration(row.activeSeconds), 'Away Time': formatDuration(row.awaySeconds),
    Sessions: row.sessions, 'CRM Actions': row.activityCount, 'Support Tickets Raised': row.tickets.total,
    'Open Tickets': row.tickets.open, 'Resolved Tickets': row.tickets.resolved,
    'User Status': row.presence, 'Risk Level': row.risk.level, 'Risk Reason': row.risk.reason,
    'Last Activity': formatDateTime(row.lastActivity)
  }))
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
  summarySheet['!cols'] = [{ wch: 32 }, { wch: 34 }]
  const reportSheet = XLSX.utils.json_to_sheet(reportRows)
  reportSheet['!cols'] = [7, 24, 32, 18, 18, 12, 13, 15, 15, 11, 14, 23, 13, 16, 18, 18, 24, 24].map((wch) => ({ wch }))
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Report Summary')
  XLSX.utils.book_append_sheet(workbook, reportSheet, 'User Activity')
  XLSX.writeFile(workbook, `User_Activity_Productivity_Report_${period.to}.xlsx`)
}

export async function downloadSuperAdminGuidePdf() {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = autoTableModule.default || autoTableModule.autoTable
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const teal = [7, 88, 72]
  const orange = [249, 115, 22]
  let logo = null
  try { logo = await logoDataUrl() } catch (error) { console.warn('PDF logo unavailable', error) }
  const header = (title, subtitle) => {
    pdf.setFillColor(243, 248, 246); pdf.rect(0, 0, 210, 30, 'F')
    if (logo) pdf.addImage(logo, 'PNG', 10, 7, 38, 14, undefined, 'FAST')
    pdf.setTextColor(...teal); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.text(title, 55, 13)
    pdf.setTextColor(71, 85, 105); pdf.setFontSize(8); pdf.text(subtitle, 55, 19)
    pdf.setDrawColor(...orange); pdf.setLineWidth(0.8); pdf.line(10, 28, 200, 28)
  }
  const table = (title, rows, startY) => {
    pdf.setTextColor(...teal); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.text(title, 10, startY)
    autoTable(pdf, { startY: startY + 3, margin: { left: 10, right: 10 }, head: [['Dashboard Item', 'Meaning / Calculation']], body: rows,
      theme: 'grid', headStyles: { fillColor: teal, fontSize: 8 }, bodyStyles: { fontSize: 8, textColor: [51, 65, 85], cellPadding: 2.5, overflow: 'linebreak' },
      columnStyles: { 0: { cellWidth: 48, fontStyle: 'bold' }, 1: { cellWidth: 132 } } })
    return pdf.lastAutoTable.finalY
  }
  header('Super Admin Dashboard Guide', 'AnantTattva CRM - metrics, charts, filters and user drill-down')
  let y = table('Top Summary Cards', [
    ['Total Users', 'Applied filters ke baad report me included CRM users. Note me active account count show hota hai.'],
    ['Online Now', 'Open session aur pichhle 15 minutes ke andar latest heartbeat wale users.'],
    ['Active CRM Time', 'Selected date range me CRM tab active/focused rehne ka total tracked time.'],
    ['Away Time', 'Session open duration minus Active CRM Time; idle window, inactive tab ya away state ka time.'],
    ['CRM Actions', 'Audit Log me recorded business actions, jaise lead, client, quotation, follow-up, approval aur support create/update. Har mouse click count nahi hota.'],
    ['Closed Leads', 'Selected period me user ke created leads me Closed status, closedBy ya closedAt wale leads.'],
    ['Support Tickets Raised', 'Selected period me user dwara create tickets; user row me Open aur Resolved breakup milta hai.'],
    ['Total Sessions', 'Selected period me recorded CRM login sessions ka total.']
  ], 38)
  pdf.setTextColor(100, 116, 139); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.text('Report selected From/To date aur applied filters par recalculate hota hai.', 10, y + 8)
  pdf.addPage(); header('Scores, Status & Risk', 'How productivity and attention signals are calculated')
  table('Productivity & Presence', [
    ['Productivity Score', 'Maximum 100: Focus up to 50 points (Active/Open ratio), CRM Actions up to 25 points (log scale), Closed Leads up to 25 points (3 per closed lead).'],
    ['Active', 'User online hai aur latest session presence active hai.'], ['Away', 'User online session me hai, lekin latest presence heartbeat away hai.'],
    ['Offline', 'Login recorded hai, par 15-minute online window me active heartbeat nahi hai.'], ['Never Logged In', 'Successful CRM login record available nahi hai.'],
    ['Low Risk', 'Account active, login recent aur high-away condition detect nahi hui.'], ['Medium Risk', 'Last login ko 7 ya usse zyada din ho gaye.'],
    ['High Risk - Away', 'Open time 30 minutes se zyada aur Away ratio 70% ya usse zyada.'], ['Inactive Account', 'User account disabled/inactive; admin review required.']
  ], 38)
  pdf.addPage(); header('Charts, Filters & Drill-down', 'How to analyse and export the report')
  table('Page Controls and Reports', [
    ['Date / Role / User', 'From-To period, role ya individual user select karke Apply Filters karein.'], ['Risk / Online Status', 'Risk signal ya current presence se report narrow karta hai.'],
    ['Search', 'Name, email ya role se search; Enter ya Apply Filters se update.'], ['Insight Cards', 'Most Active, Highest Actions, Highest Score, Most Leads aur Most Tickets.'],
    ['Active vs Away Chart', 'Top users ke focused CRM minutes aur away minutes ka comparison.'], ['Actions & Tickets Chart', 'User-wise CRM Actions aur Support Tickets comparison.'],
    ['Admin Attention', 'Never logged in, stale, high-away aur inactive counts; click se filter apply.'],
    ['User Name Click', 'Detailed Work Report: leads, client masters, completion analysis, company data aur sections.'],
    ['Eye Details', 'Daily timeline, recent actions, latest IP/device aur exact risk reason.'], ['Download PDF', 'Current filtered productivity report. Guide PDF button ye explanation download karta hai.'],
    ['Export Excel', 'Summary aur filtered user table separate Excel sheets me.'], ['Refresh', 'Latest sessions, actions, leads aur tickets backend se reload.']
  ], 38)
  const pages = pdf.internal.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) { pdf.setPage(page); pdf.setFontSize(7); pdf.setTextColor(100, 116, 139); pdf.text('AnantTattva CRM - Super Admin Dashboard Guide', 10, 289); pdf.text(`Page ${page} of ${pages}`, 200, 289, { align: 'right' }) }
  pdf.save('AnantTattva_Super_Admin_Dashboard_Guide.pdf')
}

export { REPORT_TITLE }
