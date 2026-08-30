export function parseNominal(text: string): number | null {
  if (!text) return null;
  
  let numStr = text.toLowerCase().replace(/\s+/g, '');
  // Remove thousand separators if they are dots (e.g., 500.000 -> 500000)
  // Wait, what if someone wrote 1.5jt? If we remove dot, it becomes 15jt. 
  // Let's refine: replace dot ONLY if followed by 3 digits.
  numStr = numStr.replace(/\.(?=\d{3})/g, '');
  // Convert comma to dot for decimals
  numStr = numStr.replace(/,/g, '.');
  
  let m = 1;
  if (numStr.includes('rb') || numStr.includes('ribu')) {
    m = 1000;
  } else if (numStr.includes('jt') || numStr.includes('juta')) {
    m = 1000000;
  }
  
  // Remove all non-numeric and non-dot characters
  numStr = numStr.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(numStr);
  if (isNaN(parsed)) return null;
  return parsed * m;
}
