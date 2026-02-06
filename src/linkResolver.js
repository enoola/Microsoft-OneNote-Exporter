const fs = require('fs-extra');
const path = require('path');

/**
 * Resolves internal OneNote links to Obsidian wikilinks
 * @param {Object} pageIdMap - Map of page IDs to their metadata
 * @param {string} outputBase - Base output directory (notebook root)
 * @returns {Promise<void>}
 */
async function resolveInternalLinks(pageIdMap, outputBase) {
    for (const [pageId, info] of Object.entries(pageIdMap)) {
        if (info.isDir) continue;

        let content = await fs.readFile(info.path, 'utf8');
        let modified = false;

        for (const link of info.internalLinks || []) {
            // Try to find the target item (page, section, or group) in our map
            let targetId = Object.keys(pageIdMap).find(id => {
                // Ignore empty or invalid IDs
                if (!id || id === 'undefined' || id === 'null') return false;

                // 1. Standard relaxed match (handles encoded IDs)
                if (link.href.includes(id) || link.href.includes(encodeURIComponent(id))) {
                    return true;
                }

                // 2. Fuzzy match: OneNote IDs in DOM often look like "{UUID}{1}", 
                // while links might use "UUID" or "section-id={UUID}".
                // We strip braces and suffixes to get the core UUID.
                // Example: "{123-456}{1}" -> "123-456"
                const cleanId = id.replace(/^\{/, '').split('}')[0];

                // Only perform fuzzy string match if we have a valid-looking UUID (min length)
                if (cleanId.length > 20 && link.href.includes(cleanId)) {
                    return true;
                }

                return false;
            });

            // 3. Fallback: Path-based matching for onenote: links (User suggestion)
            // Example page: onenote:Group\Section.one#Page&...
            // Example section: onenote:Section.one#section-id={...}&end
            if (!targetId && link.href.includes('onenote:')) {
                const parts = link.href.split('#');
                if (parts.length > 1) {
                    try {
                        const hierarchy = decodeURIComponent(parts[0].replace('onenote:', '').replace(/\\/g, '/')).replace(/\.one$/, '');
                        const fragment = decodeURIComponent(parts[1]);

                        let fullTargetPath;
                        if (fragment.startsWith('section-id=')) {
                            // Link to a section/folder
                            fullTargetPath = hierarchy.toLowerCase();
                        } else {
                            // Link to a page
                            const pageName = fragment.split('&')[0];
                            fullTargetPath = hierarchy ? `${hierarchy}/${pageName}`.toLowerCase() : pageName.toLowerCase();
                        }

                        targetId = Object.keys(pageIdMap).find(id => {
                            const info = pageIdMap[id];
                            const relToVault = path.relative(outputBase, info.path).replace(/\.md$/, '').toLowerCase();
                            // Match either the full path or just the end (if sections are deeply nested)
                            return relToVault === fullTargetPath || relToVault.endsWith('/' + fullTargetPath);
                        });
                    } catch (e) {
                        // Ignore parsing errors
                    }
                }
            }



            if (targetId && targetId !== pageId) {
                const targetInfo = pageIdMap[targetId];

                // Use path relative to the Output Base (Notebook Root)
                // This creates "Absolute in Vault" style links: [[Group/Section/Page]]
                let relPath = path.relative(outputBase, targetInfo.path);

                // Avoid .md extension for Wikilinks to files
                const cleanPath = targetInfo.isDir ? relPath : relPath.replace(/\.md$/, '');

                // IMPORTANT: Use a non-capturing group for the bracketed text because 
                // Turndown might have escaped characters (like _ to \_) inside it.
                // We target the unique onenote-link ID instead.
                const placeholderRegex = new RegExp(`\\[\\[.*?\\]\\]<!-- onenote-link:${link.id} -->`, 'g');

                content = content.replace(placeholderRegex, `[[${cleanPath}|${link.text}]]`);
                modified = true;
            }
        }

        // Cleanup: Remove any remaining onenote-link comments (for links that weren't resolved)
        // Also remove the comments for successfully resolved links if the regex above didn't catch them all (it should have replaced the whole block)
        // But specifically for UNRESOLVED links, we want to keep the text but remove the comment.
        // The structure for unresolved is likely: [[Link Text]]<!-- onenote-link:id -->
        // We just want to remove the comment part globally.
        if (content.includes('<!-- onenote-link:')) {
            content = content.replace(/<!-- onenote-link:.*? -->/g, '');
            modified = true;
        }

        if (modified) {
            await fs.writeFile(info.path, content);
        }
    }
}

module.exports = { resolveInternalLinks };
