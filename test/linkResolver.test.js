const { resolveInternalLinks } = require('../src/linkResolver');
const fs = require('fs-extra');
const path = require('path');

describe('Link Resolver - resolveInternalLinks', () => {
    let testDir;
    let outputBase;

    beforeEach(async () => {
        // Create temporary directory in the project for testing
        testDir = path.join(__dirname, '..', '.test-temp', `test-${Date.now()}`);
        outputBase = path.join(testDir, 'notebook');
        await fs.ensureDir(outputBase);
    });

    afterEach(async () => {
        // Cleanup
        await fs.remove(testDir);
    });

    describe('Standard ID Matching', () => {
        test('resolves links with exact ID match', async () => {
            const sectionDir = path.join(outputBase, 'Section1');
            await fs.ensureDir(sectionDir);
            const page1Path = path.join(sectionDir, 'Page1.md');
            const page2Path = path.join(sectionDir, 'Page2.md');

            await fs.writeFile(page1Path, '[[Target Page]]<!-- onenote-link:link_0 -->');
            await fs.writeFile(page2Path, 'Target content');

            const pageIdMap = {
                '{page-1-id}': {
                    path: page1Path,
                    isDir: false,
                    internalLinks: [{
                        id: 'link_0',
                        href: 'onenote:page-id={page-2-id}',
                        text: 'Target Page'
                    }]
                },
                '{page-2-id}': {
                    path: page2Path,
                    isDir: false,
                    internalLinks: []
                }
            };

            await resolveInternalLinks(pageIdMap, outputBase);

            const content = await fs.readFile(page1Path, 'utf8');
            expect(content).toBe('[[Section1/Page2|Target Page]]');
        });

        test('resolves links with encoded IDs', async () => {
            const sectionDir = path.join(outputBase, 'Section1');
            await fs.ensureDir(sectionDir);
            const page1Path = path.join(sectionDir, 'Page1.md');
            const page2Path = path.join(sectionDir, 'Page2.md');

            await fs.writeFile(page1Path, '[[Link]]<!-- onenote-link:link_0 -->');
            await fs.writeFile(page2Path, 'Content');

            const pageId = '{abc-123}';
            const encodedId = encodeURIComponent(pageId);

            const pageIdMap = {
                '{source-id}': {
                    path: page1Path,
                    isDir: false,
                    internalLinks: [{
                        id: 'link_0',
                        href: `onenote:page-id=${encodedId}`,
                        text: 'Link'
                    }]
                },
                [pageId]: {
                    path: page2Path,
                    isDir: false,
                    internalLinks: []
                }
            };

            await resolveInternalLinks(pageIdMap, outputBase);

            const content = await fs.readFile(page1Path, 'utf8');
            expect(content).toBe('[[Section1/Page2|Link]]');
        });
    });

    describe('Fuzzy ID Matching', () => {
        test('matches IDs with braces and suffixes stripped', async () => {
            const sectionDir = path.join(outputBase, 'Section1');
            await fs.ensureDir(sectionDir);
            const page1Path = path.join(sectionDir, 'Page1.md');
            const page2Path = path.join(sectionDir, 'Page2.md');

            await fs.writeFile(page1Path, '[[Target]]<!-- onenote-link:link_0 -->');
            await fs.writeFile(page2Path, 'Content');

            const pageIdMap = {
                '{source-id}': {
                    path: page1Path,
                    isDir: false,
                    internalLinks: [{
                        id: 'link_0',
                        // Link contains UUID without braces
                        href: 'onenote:page-id=abc-123-456-789-012345678901',
                        text: 'Target'
                    }]
                },
                // DOM ID has braces and suffix
                '{abc-123-456-789-012345678901}{1}': {
                    path: page2Path,
                    isDir: false,
                    internalLinks: []
                }
            };

            await resolveInternalLinks(pageIdMap, outputBase);

            const content = await fs.readFile(page1Path, 'utf8');
            expect(content).toBe('[[Section1/Page2|Target]]');
        });
    });

    describe('Directory Links', () => {
        test('resolves links to section directories', async () => {
            const sectionDir = path.join(outputBase, 'Section1');
            const targetSectionDir = path.join(outputBase, 'Section2');
            await fs.ensureDir(sectionDir);
            await fs.ensureDir(targetSectionDir);
            const pagePath = path.join(sectionDir, 'Page1.md');

            await fs.writeFile(pagePath, '[[Section Link]]<!-- onenote-link:link_0 -->');

            const pageIdMap = {
                '{source-id}': {
                    path: pagePath,
                    isDir: false,
                    internalLinks: [{
                        id: 'link_0',
                        href: 'onenote:section-id={section-2-id}',
                        text: 'Section Link'
                    }]
                },
                '{section-2-id}': {
                    path: targetSectionDir,
                    isDir: true,
                    internalLinks: []
                }
            };

            await resolveInternalLinks(pageIdMap, outputBase);

            const content = await fs.readFile(pagePath, 'utf8');
            // Should not have .md extension for directories
            expect(content).toBe('[[Section2|Section Link]]');
        });
    });

    describe('Comment Cleanup', () => {
        test('removes unresolved link comments', async () => {
            const sectionDir = path.join(outputBase, 'Section1');
            await fs.ensureDir(sectionDir);
            const pagePath = path.join(sectionDir, 'Page1.md');

            await fs.writeFile(pagePath, 'Some text [[Broken Link]]<!-- onenote-link:link_0 --> more text');

            const pageIdMap = {
                '{source-id}': {
                    path: pagePath,
                    isDir: false,
                    internalLinks: [{
                        id: 'link_0',
                        href: 'onenote:page-id={nonexistent}',
                        text: 'Broken Link'
                    }]
                }
            };

            await resolveInternalLinks(pageIdMap, outputBase);

            const content = await fs.readFile(pagePath, 'utf8');
            expect(content).toBe('Some text [[Broken Link]] more text');
            expect(content).not.toContain('<!-- onenote-link:');
        });

        test('removes multiple comment markers', async () => {
            const sectionDir = path.join(outputBase, 'Section1');
            await fs.ensureDir(sectionDir);
            const pagePath = path.join(sectionDir, 'Page1.md');

            await fs.writeFile(pagePath, '[[Link1]]<!-- onenote-link:link_0 --> and [[Link2]]<!-- onenote-link:link_1 -->');

            const pageIdMap = {
                '{source-id}': {
                    path: pagePath,
                    isDir: false,
                    internalLinks: [
                        { id: 'link_0', href: 'onenote:page-id={missing1}', text: 'Link1' },
                        { id: 'link_1', href: 'onenote:page-id={missing2}', text: 'Link2' }
                    ]
                }
            };

            await resolveInternalLinks(pageIdMap, outputBase);

            const content = await fs.readFile(pagePath, 'utf8');
            expect(content).toBe('[[Link1]] and [[Link2]]');
        });
    });

    describe('Self-referencing Links', () => {
        test('ignores links from a page to itself', async () => {
            const sectionDir = path.join(outputBase, 'Section1');
            await fs.ensureDir(sectionDir);
            const pagePath = path.join(sectionDir, 'Page1.md');

            await fs.writeFile(pagePath, '[[Self Reference]]<!-- onenote-link:link_0 -->');

            const pageIdMap = {
                '{page-1-id}': {
                    path: pagePath,
                    isDir: false,
                    internalLinks: [{
                        id: 'link_0',
                        href: 'onenote:page-id={page-1-id}',
                        text: 'Self Reference'
                    }]
                }
            };

            await resolveInternalLinks(pageIdMap, outputBase);

            const content = await fs.readFile(pagePath, 'utf8');
            // Should just remove the comment, not replace the link
            expect(content).toBe('[[Self Reference]]');
        });
    });
});
