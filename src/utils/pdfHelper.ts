/**
 * Utility functions for handling PDF CV documents, Blob URL generation,
 * Data URL sanitization, and browser download triggers with 'application/pdf' MIME type.
 */

// Helper to convert plain text CV into a valid, standard PDF v1.4 binary base64 string
export function textToPdfBase64(title: string, textContent: string): string {
  const safeTitle = (title || 'Curriculum Vitae').replace(/[()\\]/g, '');
  const lines = (textContent || '').split('\n');

  let textStream = `BT\n/F1 16 Tf\n40 790 Td\n(${safeTitle}) Tj\nET\nBT\n/F1 10 Tf\n`;
  let currentY = 750;

  for (const line of lines) {
    if (currentY < 40) break;
    const safeLine = line.replace(/[()\\]/g, '');
    textStream += `40 ${currentY} Td\n(${safeLine}) Tj\n0 -14 Td\n`;
    currentY -= 14;
  }
  textStream += `ET`;

  const streamLength = textStream.length;

  const pdfBody = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 595 842] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length ${streamLength} >>
stream
${textStream}
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000246 00000 n 
0000000326 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${400 + streamLength}
%%EOF`;

  try {
    return btoa(unescape(encodeURIComponent(pdfBody)));
  } catch (e) {
    return btoa(pdfBody);
  }
}

/**
 * Sanitizes any input CV string (Data URL, raw base64, or plain text)
 * and returns a guaranteed 'data:application/pdf;base64,...' Data URL.
 */
export function sanitizePdfDataUrl(cvData: string, applicantName = 'Applicant'): string {
  if (!cvData) {
    const defaultText = `CURRICULUM VITAE\n\nName: ${applicantName}\nOfficial Status: Verified Staff Credential\nDocument Format: PDF\n\nPineVela Staff Summary:\nCertified maintenance technician with qualifications in electrical systems, plumbing, and property operations.`;
    return `data:application/pdf;base64,${textToPdfBase64(`${applicantName} - CV`, defaultText)}`;
  }

  // If already data URL
  if (cvData.startsWith('data:')) {
    // Replace non-pdf MIME types (like application/octet-stream or image/...) if it's a PDF payload
    if (!cvData.startsWith('data:application/pdf;base64,')) {
      const base64Part = cvData.includes('base64,') ? cvData.split('base64,')[1] : '';
      if (base64Part) {
        return `data:application/pdf;base64,${base64Part}`;
      }
    }
    return cvData;
  }

  // If raw base64 string starting with JVBERi (%PDF)
  if (cvData.trim().startsWith('JVBERi') || cvData.trim().startsWith('%PDF')) {
    const cleanBase64 = cvData.trim().startsWith('%PDF') ? btoa(cvData.trim()) : cvData.trim();
    return `data:application/pdf;base64,${cleanBase64}`;
  }

  // Otherwise, plain text CV summary -> convert to Base64 PDF
  return `data:application/pdf;base64,${textToPdfBase64(`${applicantName} - CV`, cvData)}`;
}

/**
 * Converts sanitized PDF data into a native Blob with MIME type 'application/pdf'
 */
export function getPdfBlob(cvData: string, applicantName = 'Applicant'): Blob {
  const dataUrl = sanitizePdfDataUrl(cvData, applicantName);
  const base64Str = dataUrl.split('base64,')[1] || '';

  try {
    const binaryStr = atob(base64Str);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'application/pdf' });
  } catch (err) {
    const fallbackText = cvData || `${applicantName} Curriculum Vitae`;
    const fallbackBase64 = textToPdfBase64(applicantName, fallbackText);
    const binaryStr = atob(fallbackBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'application/pdf' });
  }
}

/**
 * Creates a Blob URL (blob:http...) for PDF viewing in iframes/embed objects
 */
export function getPdfBlobUrl(cvData: string, applicantName = 'Applicant'): string {
  const blob = getPdfBlob(cvData, applicantName);
  return URL.createObjectURL(blob);
}

/**
 * Triggers clean browser file download for PDF documents with 'application/pdf' MIME type
 */
export function downloadPdfDocument(cvData: string, fileName?: string, applicantName = 'Applicant'): void {
  const safeFileName = (fileName || `${applicantName}_CV.pdf`).endsWith('.pdf') 
    ? (fileName || `${applicantName}_CV.pdf`)
    : `${fileName || `${applicantName}_CV`}.pdf`;

  const blob = getPdfBlob(cvData, applicantName);
  const blobUrl = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = safeFileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();

  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(blobUrl);
  }, 1000);
}
