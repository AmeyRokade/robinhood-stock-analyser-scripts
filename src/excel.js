// Excel generation functions

export function generateExcel(data) {
  // Create workbook
  const wb = XLSX.utils.book_new();

  // Convert data to worksheet
  const ws = XLSX.utils.json_to_sheet(data);

  // Set column widths
  const colWidths = [
    { wch: 10 }, // Symbol
    { wch: 12 }, // Total Ratings
    { wch: 15 }, // Buy Ratings %
    { wch: 15 }, // Fair Value
    { wch: 12 }, // Star Rating
    { wch: 15 }, // Economic Moat
    { wch: 15 }, // Uncertainty
    { wch: 15 }, // Stewardship
    { wch: 15 }, // Quote Last Trade Price
    { wch: 20 }, // Potential Profit/Loss %
  ];

  ws['!cols'] = colWidths;

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Stock Ratings');

  // Generate Excel file
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  // Create blob and download
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `robinhood_stock_ratings_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
