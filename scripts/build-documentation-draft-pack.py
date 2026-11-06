#!/usr/bin/env python3
"""Build the editable owner handoff using only Python's standard library.

Inputs are the reviewed Markdown templates, never environment/secret files.
The Word document retains headings, tables, links and visible draft placeholders.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import zipfile
from xml.etree.ElementTree import Element, SubElement, tostring

BASE = Path(__file__).resolve().parents[1]
SOURCE = BASE / 'docs/documentation-drafts-2026-10-28'
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
XML = 'http://www.w3.org/XML/1998/namespace'


def w(name):
    return '{' + W + '}' + name


def child(parent, name, attrs=None, text=None):
    node = SubElement(parent, w(name), {w(k): str(v) for k, v in (attrs or {}).items()})
    if text is not None:
        node.text = text
    return node


def xml(node):
    return b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + tostring(node, encoding='utf-8')


def build(output):
    files = sorted(SOURCE.rglob('*.md'), key=lambda f: int(f.name[:2]))
    assert len(files) == 22 and len({f.name[:2] for f in files}) == 22
    for file in files:
        text = file.read_text()
        assert len(text) > 500, 'Unexpectedly incomplete draft: ' + file.name
        for link in re.findall(r'\]\(([^)]+\.md)\)', text):
            assert (file.parent / link).is_file(), 'Broken draft link: ' + link

    output.mkdir(parents=True, exist_ok=True)
    bookmarks = {file.resolve(): 'document_' + file.name[:2] for file in files}
    combined = '# PineVela complete documentation drafts\n\n'
    combined += 'Editable owner handoff • 28 October 2026 • Unpublished working drafts\n\n'
    combined += 'Complete placeholders and obtain appropriate Ghana review before publication. '
    combined += 'The app update enforces the current published Terms; these new drafts are not automatically published.\n\n'
    for file in files:
        def combined_link(match):
            target = (file.parent / match[2]).resolve()
            return '[' + match[1] + '](#' + bookmarks[target] + ')' if target in bookmarks else match[0]
        text = re.sub(r'\[([^\]]+)\]\(([^)]+\.md)\)', combined_link, file.read_text())
        combined += '\n\n---\n\n<a id="' + bookmarks[file.resolve()] + '"></a>\n\n<!-- Source: ' + file.relative_to(SOURCE).as_posix() + ' -->\n\n' + text
    (output / 'PineVela-complete-documentation-drafts.md').write_text(combined)

    document = Element(w('document'))
    body = child(document, 'body')
    relationships = []

    def run(parent, text, bold=False, code=False, colour=None):
        node = child(parent, 'r')
        if bold or code or colour:
            props = child(node, 'rPr')
            if bold:
                child(props, 'b')
            if code:
                child(props, 'rFonts', {'ascii': 'Consolas', 'hAnsi': 'Consolas'})
            if colour:
                child(props, 'color', {'val': colour})
                child(props, 'u', {'val': 'single'})
        t = child(node, 't', text=text)
        t.set('{' + XML + '}space', 'preserve')

    def inline(parent, text, source=None):
        parts = re.split(r'(\[[^\]]+\]\([^\s)]+\)|\*\*[^*]+\*\*|`[^`]+`)', text)
        for part in parts:
            if not part:
                continue
            match = re.fullmatch(r'\[([^\]]+)\]\(([^\s)]+)\)', part)
            if match:
                label, target = match.groups()
                link = child(parent, 'hyperlink')
                if target.startswith(('https://', 'http://', 'mailto:')):
                    rel_id = 'rIdLink' + str(len(relationships) + 1)
                    relationships.append((rel_id, target))
                    link.set('{' + R + '}id', rel_id)
                elif source and (source.parent / target).resolve() in bookmarks:
                    link.set(w('anchor'), bookmarks[(source.parent / target).resolve()])
                run(link, label, colour='003566')
            elif part.startswith('**') and part.endswith('**'):
                run(parent, part[2:-2], bold=True)
            elif part.startswith('`') and part.endswith('`'):
                run(parent, part[1:-1], code=True)
            else:
                run(parent, part)

    def paragraph(text, style='Normal', source=None, page_break=False):
        p = child(body, 'p')
        props = child(p, 'pPr')
        child(props, 'pStyle', {'val': style})
        if page_break:
            child(props, 'pageBreakBefore')
        inline(p, text, source)
        return p

    paragraph('PineVela', 'Title')
    paragraph('Complete documentation drafting pack', 'Subtitle')
    paragraph('Prepared 28 October 2026 • 22 editable documents', 'Subtitle')
    paragraph('WORKING DRAFTS — NOT APPROVED FOR PUBLICATION', 'Heading1')
    paragraph('Operator: PineVela Ghana. Contact: pinevela@pinevela.app. General minimum platform age: 16.')
    paragraph('Complete every [FILL], [DECIDE] and [REVIEW] field and obtain appropriate Ghana legal/privacy review. Do not upload this authoring pack into the public website.')
    paragraph('The accompanying app release enforces acceptance of the currently published Platform Terms. These new policy and merchant drafts remain unpublished until you approve them.')
    paragraph('Start with document 00 for the full structure and document 01 for the business worksheet. Blue links in this Word document open official references or jump to another included document.')

    def table(lines, source):
        rows = [[v.strip() for v in line.strip().strip('|').split('|')] for line in lines if not re.match(r'^\s*\|[\s:|\-]+\|\s*$', line)]
        count = max(map(len, rows))
        tbl = child(body, 'tbl')
        props = child(tbl, 'tblPr')
        child(props, 'tblStyle', {'val': 'TableGrid'})
        child(props, 'tblW', {'w': 9360, 'type': 'dxa'})
        child(props, 'tblLayout', {'type': 'fixed'})
        grid = child(tbl, 'tblGrid')
        for _ in range(count):
            child(grid, 'gridCol', {'w': 9360 // count})
        for row_index, row in enumerate(rows):
            tr = child(tbl, 'tr')
            if row_index == 0:
                child(child(tr, 'trPr'), 'tblHeader')
            for value in row + [''] * (count - len(row)):
                tc = child(tr, 'tc')
                props = child(tc, 'tcPr')
                child(props, 'tcW', {'w': 9360 // count, 'type': 'dxa'})
                if row_index % 2 == 0:
                    child(props, 'shd', {'fill': 'EAF0F7'})
                p = child(tc, 'p')
                child(child(p, 'pPr'), 'pStyle', {'val': 'TableText'})
                inline(p, value, source)
        paragraph('')

    for index, file in enumerate(files):
        lines = file.read_text().splitlines()
        position = 0
        while position < len(lines):
            line = lines[position].strip()
            if not line:
                position += 1
                continue
            if line.startswith('|'):
                table_lines = []
                while position < len(lines) and lines[position].strip().startswith('|'):
                    table_lines.append(lines[position])
                    position += 1
                table(table_lines, file)
                continue
            heading = re.match(r'^(#{1,6})\s+(.*)', line)
            if heading:
                level = len(heading[1])
                p = paragraph(heading[2], 'Heading' + str(min(level, 3)), file, page_break=level == 1)
                if level == 1:
                    marker = Element(w('bookmarkStart'), {w('id'):str(index + 1),w('name'):bookmarks[file.resolve()]})
                    p.insert(1, marker)
                    child(p, 'bookmarkEnd', {'id': index + 1})
            elif line.startswith('- '):
                paragraph('• ' + line[2:], 'ListParagraph', file)
            else:
                paragraph(line, source=file)
            position += 1

    section = child(body, 'sectPr')
    footer_reference = child(section, 'footerReference', {'type': 'default'})
    footer_reference.set('{' + R + '}id', 'rIdFooter')
    child(section, 'pgSz', {'w': 11906, 'h': 16838})
    child(section, 'pgMar', {'top': 1134, 'right': 1273, 'bottom': 1134, 'left': 1273, 'header': 500, 'footer': 500})
    styles = Element(w('styles'))
    defaults = child(styles, 'docDefaults')
    rpr = child(child(defaults, 'rPrDefault'), 'rPr')
    child(rpr, 'rFonts', {'ascii': 'Calibri', 'hAnsi': 'Calibri'})
    child(rpr, 'sz', {'val': 22})
    child(rpr, 'color', {'val': '152E49'})
    child(child(child(defaults, 'pPrDefault'), 'pPr'), 'spacing', {'after': 140, 'line': 280, 'lineRule': 'auto'})
    for name, size, colour in [('Normal', 22, '152E49'), ('Title', 60, '001D3D'), ('Subtitle', 28, '52657C'), ('Heading1', 34, '001D3D'), ('Heading2', 27, '003566'), ('Heading3', 23, '003566'), ('ListParagraph', 22, '152E49'), ('TableText', 18, '152E49')]:
        style = child(styles, 'style', {'type': 'paragraph', 'styleId': name})
        child(style, 'name', {'val': name})
        props = child(style, 'pPr')
        if name.startswith('Heading'):
            child(props, 'keepNext')
            child(props, 'outlineLvl', {'val': int(name[-1]) - 1})
        if name == 'ListParagraph':
            child(props, 'ind', {'left': 240, 'hanging': 180})
        rpr = child(style, 'rPr')
        child(rpr, 'sz', {'val': size})
        child(rpr, 'color', {'val': colour})
        if name.startswith('Heading') or name == 'Title':
            child(rpr, 'b')
    table_style = child(styles, 'style', {'type': 'table', 'styleId': 'TableGrid'})
    borders = child(child(table_style, 'tblPr'), 'tblBorders')
    for side in ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']:
        child(borders, side, {'val': 'single', 'sz': 4, 'color': 'C5D8EC'})

    footer = Element(w('ftr'))
    p = child(footer, 'p')
    run(p, 'PineVela • Unpublished drafts • 28 October 2026     ')
    field = child(p, 'fldSimple', {'instr': 'PAGE'})
    run(field, '1')
    rel_ns = 'http://schemas.openxmlformats.org/package/2006/relationships'
    rels = Element('Relationships', xmlns=rel_ns)
    for rel_id, target in relationships:
        SubElement(rels, 'Relationship', Id=rel_id, Type=R + '/hyperlink', Target=target, TargetMode='External')
    for rel_id, kind, target in [('rIdStyles', 'styles', 'styles.xml'), ('rIdFooter', 'footer', 'footer1.xml')]:
        SubElement(rels, 'Relationship', Id=rel_id, Type=R + '/' + kind, Target=target)
    docx = output / 'PineVela-complete-documentation-drafts.docx'
    with zipfile.ZipFile(docx, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>')
        archive.writestr('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdOffice" Type="' + R + '/officeDocument" Target="word/document.xml"/></Relationships>')
        archive.writestr('word/document.xml', xml(document))
        archive.writestr('word/styles.xml', xml(styles))
        archive.writestr('word/footer1.xml', xml(footer))
        archive.writestr('word/_rels/document.xml.rels', xml(rels))
    readme = ('PINEVELA DOCUMENTATION DRAFTS — 28 OCTOBER 2026\n\n'
              'Open PineVela-complete-documentation-drafts.docx in Microsoft Word, LibreOffice or Google Docs to edit all 22 documents.\n'
              'The Markdown folder contains the same documents separately. Start with 00-START-HERE.md and 01-business-decisions.md.\n\n'
              'Resolve every [FILL], [DECIDE] and [REVIEW] placeholder and obtain appropriate Ghana legal/privacy review.\n'
              'These are unpublished drafting materials. Do not extract this ZIP into your live website or application.\n'
              'Use the separate app-update ZIP for the transparent logos and current-published-Terms acceptance feature.\n')
    (output / 'README-FIRST.txt').write_text(readme)
    manifest = {str(file.relative_to(SOURCE)): hashlib.sha256(file.read_bytes()).hexdigest() for file in files}
    (output / 'draft-source-manifest.json').write_text(json.dumps({'documents': 22, 'status': 'unpublished drafts', 'files': manifest}, indent=2) + '\n')
    archive_path = output.with_suffix('.zip')
    with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED) as archive:
        for file in files:
            archive.write(file, 'markdown/' + file.relative_to(SOURCE).as_posix())
        for name in ['README-FIRST.txt', 'PineVela-complete-documentation-drafts.docx', 'PineVela-complete-documentation-drafts.md', 'draft-source-manifest.json']:
            archive.write(output / name, name)
    print(json.dumps({'documents': 22, 'docx': str(docx), 'zip': str(archive_path), 'zipBytes': archive_path.stat().st_size,
                      'sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest()}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=Path('/tmp/pinevela-documentation-drafts-20261028'))
    build(parser.parse_args().output.resolve())
