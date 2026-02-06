const chalk = require('chalk');
const { withRetry } = require('./utils/retry');

/**
 * Scrapes the list of sections and section groups from the current notebook view.
 * @param {object} frame - The Playwright frame object.
 * @returns {Promise<Array>} - List of items { id, name, type: 'section'|'group' }.
 */
async function getSections(frame, parentId = null) {
    return await frame.evaluate((pid) => {
        const results = [];

        // Find the "root" of the search level
        let searchContainer = document.body;

        if (pid) {
            const parentNode = document.getElementById(pid);
            if (parentNode) {
                // Find the [role="group"] associated with this node.
                // In OneNote Web, it's often a sibling or nested below a wrapper.
                let groupContents = parentNode.querySelector('[role="group"]');

                if (!groupContents) {
                    // Check siblings of the parentNode or its ancestor (common row structure)
                    let current = parentNode;
                    // Walk up a few levels if needed to find the container that holds both header and group
                    for (let i = 0; i < 3 && current; i++) {
                        const siblingGroup = current.parentElement.querySelector(':scope > [role="group"]');
                        if (siblingGroup) {
                            groupContents = siblingGroup;
                            break;
                        }
                        // Or try next sibling directly
                        let next = current.nextElementSibling;
                        if (next && next.getAttribute('role') === 'group') {
                            groupContents = next;
                            break;
                        }
                        current = current.parentElement;
                    }
                }

                if (groupContents) {
                    searchContainer = groupContents;
                } else {
                    // Final fallback: look specifically for a container that looks like it belongs to us
                    const groupContainer = parentNode.closest('[class*="sectionGroupContainer"]');
                    if (groupContainer) {
                        // Avoid broad querySelector if possible, but keep as last resort
                        searchContainer = groupContainer.querySelector('[role="group"]') || [];
                    } else {
                        return [];
                    }
                }
            } else {
                return [];
            }
        }

        // Find all potential sections and groups in the container
        const allItems = Array.from(searchContainer.querySelectorAll('div[class*="sectionListItem"], div[class*="sectionGroup__groupItemWrap"]'));

        // Use parent-walking to find DIRECT children of this level
        const directItems = allItems.filter(item => {
            // Basic size check (ignore elements that are not rendered)
            if (item.offsetWidth === 0 && item.offsetHeight === 0) return false;

            // An item is a "direct child" if there is NO intermediate [role="group"] 
            // between it and the searchContainer.
            let p = item.parentElement;
            while (p && p !== searchContainer) {
                if (p.getAttribute('role') === 'group') return false;
                p = p.parentElement;
            }
            return true;
        });

        // Exclude breadcrumbs if at root
        const finalItems = directItems.filter(item => {
            if (!pid) {
                if (item.closest('[class*="Breadcrumb"]') || item.closest('[class*="breadcrumb"]')) return false;
            }
            return true;
        });

        finalItems.forEach(node => {
            if (!node.id) return;

            // Use classList for more robust class checking
            const isGroup = node.classList.contains('sectionGroup__groupItemWrap___L6X6Z') ||
                node.className.includes('sectionGroup__groupItemWrap');
            const id = node.id;
            let name = 'Unknown';

            if (isGroup) {
                const ariaLabel = node.getAttribute('aria-label');
                name = ariaLabel ? ariaLabel.split(', Section Group')[0].trim() : node.innerText.trim();
            } else {
                const ariaLabel = node.querySelector('.navItem')?.getAttribute('aria-label') || node.getAttribute('aria-label');
                name = ariaLabel ? ariaLabel.split(', Section')[0].trim() : node.innerText.trim();
            }

            results.push({ id, name, type: isGroup ? 'group' : 'section' });
        });


        return results;
    }, parentId);
}

/**
 * Scrapes the list of pages from the current section view.
 * @param {object} frame - The Playwright frame object.
 * @returns {Promise<Array>} - List of pages { id, name }.
 */
async function getPages(frame) {
    // Selector based on debug dump
    // Container: #PageList
    // Item: .pageNode -> .pageListItem
    // We can target .pageNode directly to get the ID from it, or .pageListItem
    // dump: <div class="pageNode" id="{UUID}{1}"> ... <div class="pageListItem"> ... aria-label="Untitled Page, Page..."

    const pages = await frame.$$eval('.pageNode', nodes => {
        return nodes.map(node => {
            const id = node.id;
            const listItem = node.querySelector('.pageListItem');
            let name = 'Untitled Page';

            if (listItem) {
                const navItem = listItem.querySelector('.navItem');
                if (navItem) {
                    let label = navItem.getAttribute('aria-label') || navItem.innerText.trim() || '';

                    // 1. Strip accessibility verbose suffix (e.g. ", Page. Selected...", ", Page. Select...")
                    // We look for ", Page." followed by "Select" logic
                    label = label.replace(/,\s*Page\.?\s*Select.*$/i, '');

                    // 2. Strip standard "page X of Y" suffix
                    // Matches: ", Page 1 of 3"
                    label = label.replace(/[,]?\s*Page\s+\d+\s+of\s+\d+\s*$/i, '');

                    name = label.trim();
                    if (!name) name = 'Untitled Page';
                }
            }
            return { id, name };
        });

    });
    return pages;
}

/**
 * Selects a section by ID with retry logic.
 * @param {object} frame 
 * @param {string} sectionId 
 */
async function selectSection(frame, sectionId) {
    return withRetry(async () => {
        const sectionSelector = `[id="${sectionId}"]`;
        const wrapper = await frame.$(sectionSelector);

        if (wrapper) {
            await wrapper.scrollIntoViewIfNeeded();

            // Try clicking the navItem inside first
            const navItem = await wrapper.$('.navItem');
            if (navItem) {
                await navItem.click();
            } else {
                // Fallback to clicking the wrapper itself
                await wrapper.click();
            }
        } else {
            throw new Error(`Section wrapper not found for ID: ${sectionId}`);
        }
    }, {
        maxAttempts: 3,
        initialDelayMs: 500,
        operationName: 'Select section',
        silent: true
    });
}

/**
 * Scrapes the content of the currently selected page.
 * @param {object} frame - The Playwright frame object.
 * @returns {Promise<object>} - { title, contentHtml }.
 */
async function getPageContent(frame) {
    return await frame.evaluate(() => {
        // Find the main canvas/content area
        const canvas = document.querySelector('#OreoCanvas') ||
            document.querySelector('.canvasContainer') ||
            document.body;

        // OneNote stores content in "Outlines"
        const outlines = Array.from(canvas.querySelectorAll('.OutlineContainer'));

        // Sort outlines by their visual position (top, then left)
        // This prevents content flipping when DOM order doesn't match visual layout
        outlines.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();

            // Use a small vertical threshold (10px) to treat items roughly on the same line
            if (Math.abs(rectA.top - rectB.top) > 10) {
                return rectA.top - rectB.top;
            }
            return rectA.left - rectB.left;
        });

        let title = '';
        let dateTime = '';

        // Prepare a clone for cleanup to avoid affecting the UI
        const contentDiv = document.createElement('div');

        outlines.forEach(outline => {
            const clone = outline.cloneNode(true);

            // Handle Title and DateTime specifically
            const isTitle = outline.querySelector('.TitleOutline');
            const isDateTime = outline.querySelector('.TitleDateTimeOutline');

            if (isTitle) {
                title = outline.innerText.trim();
                return; // Don't add to main content body
            }
            if (isDateTime) {
                // Join multiple lines (date and time) into one
                dateTime = outline.innerText.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
                return; // Don't add to main content body
            }

            // Remove UI elements that shouldn't be in Markdown
            const toRemove = clone.querySelectorAll([
                '.DragHandle',
                '.OutlineResizeHandleContainer',
                '.OutlineResize',
                '.insertionHint',
                'button',
                'script',
                'style'
            ].join(','));

            toRemove.forEach(el => el.remove());

            contentDiv.appendChild(clone);
        });

        // Fallback for Title if not found in outlines
        if (!title) {
            const titleEl = document.querySelector('.pageTitle') ||
                document.querySelector('div[aria-label*="Page Title"]') ||
                document.querySelector('input[placeholder="Page Title"]');
            if (titleEl) {
                title = titleEl.value || titleEl.innerText || '';
            }
        }

        // If no outlines found, fallback to more generic selectors
        if (outlines.length === 0) {
            const fallback = document.querySelector('div[role="main"]') || document.querySelector('#OneNoteContent');
            if (fallback) {
                const clone = fallback.cloneNode(true);
                contentDiv.appendChild(clone);
            }
        }

        const attachmentInfos = [];
        const internalLinks = [];
        const videoInfos = [];
        const embedInfos = [];

        // 1. Extract YouTube/Vimeo/Embeds
        const allIframes = Array.from(contentDiv.querySelectorAll('iframe'));
        allIframes.forEach(iframe => {
            let src = iframe.getAttribute('src') || '';
            if (src.includes('youtube.com') || src.includes('youtu.be') || src.includes('vimeo.com')) {
                const embedId = `embed_${embedInfos.length}`;
                embedInfos.push({ id: embedId, src, type: 'video' });
                iframe.setAttribute('data-embed-id', embedId);
            }
        });

        // 2. Extract Video elements
        const allVideos = Array.from(contentDiv.querySelectorAll('video'));
        allVideos.forEach(video => {
            let src = video.getAttribute('src');
            if (!src) {
                const source = video.querySelector('source');
                if (source) src = source.getAttribute('src');
            }
            if (src) {
                const videoId = `video_${videoInfos.length}`;
                videoInfos.push({ id: videoId, src });
                video.setAttribute('data-local-video', videoId);
            }
        });

        // 3. Extract File Attachments and Internal Links
        const allLinks = Array.from(contentDiv.querySelectorAll('a'));
        allLinks.forEach((link, idx) => {
            let href = link.getAttribute('href') || '';
            const text = link.innerText.trim();
            const className = link.className || '';

            // Detect Internal OneNote Links
            // OneNote uses various formats for internal links:
            // 1. onenote:https://... or onenote:/// protocol
            // 2. view.aspx?page-id=... or section-id=...
            // 3. Links starting with # (anchor/fragment-only)
            // 4. Links with no href or empty href (most common for internal links!)
            // 5. Links without http protocol (relative links)
            // 6. Full URLs to OneNote/SharePoint domains
            const isOneNoteUrl = href.includes('onenote.') ||
                href.includes('.officeapps.live.com') ||
                href.includes('.sharepoint.com') ||
                href.includes('view.aspx');

            const isInternal = !href ||  // No href attribute or empty href
                href === '#' ||  // Just an anchor
                href.includes('onenote:') ||
                isOneNoteUrl ||
                (!href.startsWith('http') && !href.startsWith('//') && !href.startsWith('mailto:') && !href.startsWith('file:') && !href.startsWith('data:'));

            if (isInternal) {
                const linkId = `link_${internalLinks.length}`;
                internalLinks.push({ id: linkId, href, text });
                link.setAttribute('data-internal-link', linkId);
                return;
            }

            // Detect File Attachments (Cloud or Local UI)
            // Local attachments often have classes like "attachmentListItem" or "fileIcon"
            const isCloudFile = className.includes('HyperlinkV2') &&
                (href.includes('sharepoint.com') || href.includes('1drv.ms') || href.includes('onedrive.live.com'));

            const isLocalFile = className.includes('attachment') ||
                link.querySelector('img[src*="box43.png"]') || // OneNote icon for attachments
                className.includes('fileIcon') ||
                // Fallback: Check for common file extensions in the link text or href if it looks like a file
                /\.(docx?|xlsx?|pptx?|pdf|txt|md|csv|zip|rar|7z|json|xml|log)$/i.test(text) ||
                (/\.(docx?|xlsx?|pptx?|pdf|txt|md|csv|zip|rar|7z|json|xml|log)$/i.test(href) && !href.includes('onenote:'));

            if (isCloudFile || isLocalFile) {
                const attachId = `file_${attachmentInfos.length}`;
                // Try to infer name from text or href if text is empty
                let originalName = text || 'attached_file';
                if (originalName === 'attached_file' || originalName === '') {
                    const match = href.match(/([^\/]+\.[a-zA-Z0-9]+)$/);
                    if (match) originalName = match[1];
                }

                attachmentInfos.push({ id: attachId, src: href, originalName: originalName });
                link.setAttribute('data-local-file', attachId);
                link.setAttribute('data-filename', originalName);

                // IMPORTANT: Find the original link in the actual DOM to tag it for clicking
                // This is tricky because we are inside an evaluate function and link is a clone child.
                // We'll use a more direct approach by tagging the real elements in the canvas first.
            }
        });

        // RE-TAGGING REAL ELEMENTS: Since we need to click the ACTUAL elements later, 
        // we'll search the real canvas for the same links and tag them.
        attachmentInfos.forEach(info => {
            const realLinks = Array.from(canvas.querySelectorAll('a'));
            // Fuzzy match: exact href is best, but sometimes text differs slightly. 
            // We prioritize exact href match.
            const matchingLink = realLinks.find(l => l.getAttribute('href') === info.src); // Relaxed check
            if (matchingLink) {
                matchingLink.setAttribute('data-one-attach-id', info.id);
            }
        });

        // 4. Extract image info
        const imageInfos = [];
        outlines.forEach(outline => {
            const originalImgs = Array.from(outline.querySelectorAll('img'));
            originalImgs.forEach((origImg) => {
                let src = origImg.getAttribute('src');
                if (src) {
                    if (!src.startsWith('data:')) {
                        try { src = new URL(src, window.location.href).href; } catch (e) { }
                    }

                    const srcLower = src.toLowerCase();
                    const className = (origImg.className || '').toLowerCase();

                    // UI patterns to exclude
                    const isMicrosoftUI = (srcLower.includes('static.microsoft') || srcLower.includes('officeonline')) &&
                        (srcLower.includes('/m2/') || srcLower.includes('/resources/'));

                    const isGenericIcon = srcLower.includes('one.png') ||
                        srcLower.includes('box42.png') ||
                        srcLower.includes('box43.png');

                    const hasUIClass = className.includes('handle') ||
                        className.includes('resize') ||
                        className.includes('insertionhint') ||
                        className.includes('one_');

                    const isOneNoteImage = srcLower.includes('getimage.ashx');
                    const isWACImage = className.includes('wacimage');

                    const width = origImg.offsetWidth || origImg.naturalWidth || 0;
                    const height = origImg.offsetHeight || origImg.naturalHeight || 0;

                    // Filter out small MS icons (likely tags/handles) even if they look like GetImage.ashx
                    const isSmallMSIcon = isMicrosoftUI && width > 0 && width < 30 && height > 0 && height < 30;

                    // Logic: 
                    // 1. If it's a known OneNote content image (GetImage.ashx or WACImage), keep it regardless of size
                    // 2. Otherwise, exclude obvious Microsoft UI/icons
                    // 3. Keep if it has some size OR has no UI-specific class and looks like content
                    const isRealImage = (isOneNoteImage || isWACImage || (
                        !isMicrosoftUI &&
                        !isGenericIcon &&
                        !hasUIClass &&
                        (width > 5 || height > 5 || (width === 0 && !className))
                    )) && !isSmallMSIcon;

                    if (isRealImage) {
                        const id = `img_${imageInfos.length}`;
                        imageInfos.push({ id, src });

                        const clonedImgs = Array.from(contentDiv.querySelectorAll('img'));
                        const matchingClone = clonedImgs.find(c => c.getAttribute('src') === origImg.getAttribute('src') && !c.hasAttribute('data-local-src'));
                        if (matchingClone) {
                            matchingClone.setAttribute('data-local-src', id);
                            let alt = matchingClone.getAttribute('alt') || '';
                            if (alt.includes('\n') || alt.includes('ACCESSIBILITY') || alt.length > 300) {
                                const firstLine = alt.split('\n')[0].trim();
                                matchingClone.setAttribute('alt', (firstLine.length < 100 && !firstLine.includes('ACCESSIBILITY')) ? firstLine : '');
                            }
                        }
                    }
                }
            });
        });

        // Cleanup: remove skipped images
        Array.from(contentDiv.querySelectorAll('img')).forEach(img => {
            if (!img.hasAttribute('data-local-src')) img.remove();
        });

        return {
            title,
            dateTime,
            contentHtml: contentDiv.innerHTML,
            images: imageInfos,
            attachments: attachmentInfos,
            internalLinks: internalLinks,
            videos: videoInfos,
            embeds: embedInfos
        };
    });
}

/**
 * Selects a page by ID with retry logic.
 * @param {object} frame 
 * @param {string} pageId 
 */
async function selectPage(frame, pageId) {
    return withRetry(async () => {
        const pageSelector = `[id="${pageId}"]`;
        const wrapper = await frame.$(pageSelector);
        if (wrapper) {
            await wrapper.scrollIntoViewIfNeeded();
            const navItem = await wrapper.$('.navItem');
            if (navItem) {
                await navItem.click();
            } else {
                await wrapper.click();
            }
        } else {
            throw new Error(`Page wrapper not found for ID: ${pageId}`);
        }
    }, {
        maxAttempts: 3,
        initialDelayMs: 500,
        operationName: 'Select page',
        silent: true
    });
}

/**
 * Navigates back to the parent section group.
 * @param {object} frame 
 * @returns {Promise<boolean>} - True if clicked, false otherwise.
 */
async function navigateBack(frame) {
    // Selectors for the back button in the navigation pane
    const backSelectors = [
        'button[aria-label="Back"]',
        'button[title="Back"]',
        '.wacFlexBox__onoBreadcrumbPanel___MuqE6 button', // Class found in dump
        '.navigationPane__backButton', // Potential class
        'i[class*="arrow"][class*="left"]' // Fallback to icon
    ];

    for (const selector of backSelectors) {
        const btn = await frame.$(selector);
        if (btn) {
            await btn.click();
            return true;
        }
    }
    return false;
}

/**
 * Detects if the currently selected section is password protected (locked).
 * @param {object} frame - The Playwright frame object.
 * @returns {Promise<boolean>}
 */
async function isSectionLocked(frame) {
    return await frame.evaluate(() => {
        const texts = [
            "Section Password Protected",
            "This section is password protected"
        ];

        // Find elements that contain the text
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            const content = node.textContent;
            if (texts.some(t => content.includes(t))) {
                const parent = node.parentElement;
                if (!parent) continue;

                // Check visibility
                const style = window.getComputedStyle(parent);
                if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) continue;

                // Exclude navigation panes accurately
                // OneNote Web uses these classes/IDs for the left panes
                if (parent.closest('.sectionList') ||
                    parent.closest('.pagesContainer') ||
                    parent.closest('#NavPaneSectionList') ||
                    parent.closest('#PageList') ||
                    parent.closest('[class*="navItem"]') ||
                    parent.closest('[class*="pageListItem"]')) {
                    continue;
                }

                return true;
            }
        }
        return false;
    });
}

module.exports = {
    getSections,
    getPages,
    selectSection,
    getPageContent,
    selectPage,
    navigateBack,
    isSectionLocked
};
