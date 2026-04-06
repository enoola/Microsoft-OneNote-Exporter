
const isFileLink = (link) => {
    const href = link.getAttribute('href') || '';
    const text = link.innerText.trim();
    const title = link.getAttribute('title') || '';
    const ariaLabel = link.getAttribute('aria-label') || '';
    const className = (link.className || '').toLowerCase();
    const parentClass = (link.parentElement?.className || '').toLowerCase();

    // Explicitly skip internal navigation protocols
    if (href.startsWith('onenote:') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
        return { isFile: false, isCloud: false };
    }

    const isSharePoint = href.includes('sharepoint.com') || href.includes('1drv.ms') || href.includes('onedrive.live.com');

    // Extension check helper (cases like "file.pdf" or "file.pdf.xlsx")
    // Broadened to search ANYWHERE in string (handles ?web=1 or Doc2.aspx?file=...)
    const fileExtRegex = /\.(docx?|xlsx?|pptx?|pdf|txt|md|csv|zip|rar|7z|json|xml|log|png|jpe?g|gif|svg)(\?|&|$)/i;

    const isCloud = (className.includes('hyperlinkv2') || className.includes('cloudfile') || className.includes('onedrive') || parentClass.includes('cloudfile')) &&
        isSharePoint;

    // SharePoint/OneDrive specific document markers
    const isOfficeCloudDoc = isSharePoint && (
        href.includes('/:x:/') || href.includes('/:w:/') || href.includes('/:p:/') || // Excel, Word, PowerPoint markers
        href.includes('/Doc.aspx') || href.includes('/Doc2.aspx') ||
        href.includes('WopiFrame.aspx') ||
        href.includes('WopiFrame2.aspx')
    );

    // Check if it's a known attachment or looks like a file resource
    const isLocal = className.includes('attachment') ||
        className.includes('wacef') || // OneNote Web "File" class
        parentClass.includes('attachment') ||
        parentClass.includes('wacef') ||
        className.includes('fileicon') ||
        fileExtRegex.test(title) ||
        fileExtRegex.test(ariaLabel) ||
        // Check text separately with truncation awareness
        fileExtRegex.test(text.split('\n')[0].trim()) ||
        fileExtRegex.test(href);

    return { isFile: isCloud || isLocal || isOfficeCloudDoc, isCloud: isCloud || isOfficeCloudDoc };
};

// Mocking the link element structure
const mockLink = (props) => ({
    getAttribute: (name) => props[name] || '',
    innerText: props.text || '',
    className: props.className || '',
    parentElement: props.parentElement || { className: '' },
    querySelector: () => null
});

const testCases = [
    {
        name: "SharePoint Excel Link (from screenshot) - FIXED",
        href: "https://company-my.sharepoint.com/:x:/r/personal/mememe/Documents/Complete%20yet%20Small%20Test%20Notebook?d=w1a02e8536e3b45a5a0ab661c7306f05c&csf=1&web=1&e=oVPj2z",
        text: "Reference to excel file",
        className: ""
    },
    {
        name: "Direct Excel Link in URL but as aspx - HANDLED",
        href: "https://example.sharepoint.com/:x:/r/teams/Something/_layouts/15/Doc2.aspx?file=TdS_IBM-2026.xlsx",
        text: "TdS_IBM-2026",
        className: ""
    }
];

testCases.forEach(tc => {
    const link = mockLink(tc);
    const result = isFileLink(link);
    console.log(`Test: ${tc.name}`);
    console.log(`  Result: ${JSON.stringify(result)}`);
    console.log(`  Expected isFile: true`);
    if (result.isFile === true) {
        console.log("  PASS");
    } else {
        console.log("  FAIL");
    }
});
