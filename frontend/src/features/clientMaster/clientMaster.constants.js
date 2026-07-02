import { buildAnnualReturnYearOptions } from './clientMaster.utils';

export const selectOptions = {
  approvalStatus: ['PENDING', 'APPROVED', 'REJECTED'],
  visibilityStatus: ['DISCONTINUED', 'LIVE', 'SUSPENDED'],
  piboCategory: ['Producer', 'Importer', 'Brand Owner', 'Recycler', 'PWP', 'Refurbisher'],
  eprCategory: ['EPR - Plastic Waste', 'EPR - E-Waste', 'EPR - Battery Waste', 'EPR - Tyre Waste', 'EPR - Used Oil Waste'],
  years: Array.from({ length: 12 }, (_, index) => String(new Date().getFullYear() - index)),
  annualReturnYears: buildAnnualReturnYearOptions(),
  states: ['Gujarat', 'Maharashtra', 'Karnataka', 'Delhi', 'Rajasthan', 'Uttar Pradesh', 'Haryana', 'Tamil Nadu', 'Telangana'],
  cities: ['Ahmedabad', 'Surat', 'Mumbai', 'Pune', 'Bengaluru', 'Delhi', 'Jaipur', 'Noida', 'Gurugram', 'Chennai', 'Hyderabad'],
  cpcbStatus: ['Not Started', 'Applied', 'Under Review', 'Approved', 'Rejected'],
  msmeStatus: ['Micro', 'Small', 'Medium', 'Not Applicable'],
  msmeActivity: ['Manufacturing', 'Service', 'Trading']
};

export const quotationServiceCategoryOptions = [
  'CASE REPRESENTATION',
  'CAT-1-EOL CREDIT',
  'CAT-1-RECYCLING CREDIT',
  'CAT-2-EOL CREDIT',
  'CAT-2-RECYCLING CREDIT',
  'CAT-3-EOL CREDIT',
  'CAT-3-RECYCLING CREDIT',
  'CATEGORY 1',
  'CATEGORY 2',
  'CATEGORY 3',
  'CGWA NOC FRESH',
  'CONSULTANCY FEE',
  'CPCB NOTICE REPLY',
  'CTE & CTO NEW REGISTRATION',
  'CTE-CONSENT TO ESTABLISH',
  'CTO-CONSENT TO OPERATE',
  'CTO-RENEWAL',
  'E-WASTE CREDIT',
  'ENVIRONMENT STATEMENT',
  'EPR CREDIT RE',
  'EPR CREDIT REVERSE',
  'EPR ETP PORTAL HANDLING',
  'EPR LOGIN SURRENDER',
  'GOVT. REPRESENTATION',
  'KAVACH AUDIT',
  'MATERIAL WASTE MANAGEMENT',
  'PLANT AUDIT',
  'PORTAL HEALTH REPORT'
];
