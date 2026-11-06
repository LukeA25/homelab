"""Read-only EPUB container access.

Opens the archive, locates the OPF package document, and exposes the spine,
Dublin Core metadata, and the NCX/nav table of contents. Nothing here ever
writes to the source file.
"""

from __future__ import annotations

import posixpath
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from lxml import etree

_CONTAINER = "META-INF/container.xml"
_NS = {
    "opf": "http://www.idpf.org/2007/opf",
    "dc": "http://purl.org/dc/elements/1.1/",
    "ncx": "http://www.daisy.org/z3986/2005/ncx/",
    "container": "urn:oasis:names:tc:opendocument:xmlns:container",
    "xhtml": "http://www.w3.org/1999/xhtml",
}


@dataclass
class NavPoint:
    """One entry in the NCX table of contents, with its nesting preserved."""

    nav_id: str
    title: str
    href: str
    fragment: str
    level: int
    children: list["NavPoint"]


class EpubFile:
    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.zip = zipfile.ZipFile(self.path)
        self.opf_path = self._find_opf()
        self.opf_dir = posixpath.dirname(self.opf_path)
        self.opf = etree.fromstring(self.zip.read(self.opf_path))

    def close(self) -> None:
        self.zip.close()

    def __enter__(self) -> "EpubFile":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def _find_opf(self) -> str:
        try:
            container = etree.fromstring(self.zip.read(_CONTAINER))
            rootfile = container.find(".//container:rootfile", _NS)
            if rootfile is not None and rootfile.get("full-path"):
                return rootfile.get("full-path")
        except KeyError:
            pass
        for name in self.zip.namelist():
            if name.endswith(".opf"):
                return name
        raise ValueError(f"{self.path.name}: no OPF package document found")

    def resolve(self, href: str) -> str:
        href = href.split("#", 1)[0]
        return posixpath.normpath(posixpath.join(self.opf_dir, href)) if self.opf_dir else href

    def read(self, href: str) -> bytes:
        return self.zip.read(self.resolve(href))

    def has(self, href: str) -> bool:
        try:
            self.zip.getinfo(self.resolve(href))
            return True
        except KeyError:
            return False

    @property
    def metadata(self) -> dict[str, str]:
        out: dict[str, str] = {}
        for element in self.opf.findall(".//dc:*", _NS):
            tag = etree.QName(element).localname
            if element.text and element.text.strip():
                out.setdefault(tag, element.text.strip())
        return out

    @property
    def version(self) -> str:
        return self.opf.get("version", "")

    @property
    def spine(self) -> list[str]:
        """Content document hrefs in reading order, relative to the OPF."""
        manifest = {
            item.get("id"): item.get("href")
            for item in self.opf.findall(".//opf:manifest/opf:item", _NS)
        }
        hrefs = []
        for ref in self.opf.findall(".//opf:spine/opf:itemref", _NS):
            href = manifest.get(ref.get("idref"))
            if href:
                hrefs.append(href)
        return hrefs

    def _ncx_href(self) -> Optional[str]:
        spine = self.opf.find(".//opf:spine", _NS)
        toc_id = spine.get("toc") if spine is not None else None
        for item in self.opf.findall(".//opf:manifest/opf:item", _NS):
            if item.get("id") == toc_id or item.get("href", "").endswith(".ncx"):
                return item.get("href")
        return None

    def nav_points(self) -> list[NavPoint]:
        """The NCX table of contents as a tree. Empty if the file has no NCX."""
        href = self._ncx_href()
        if not href or not self.has(href):
            return []
        root = etree.fromstring(self.read(href))
        nav_map = root.find(".//ncx:navMap", _NS)
        if nav_map is None:
            return []

        def build(element, level: int) -> NavPoint:
            label = element.find("./ncx:navLabel/ncx:text", _NS)
            content = element.find("./ncx:content", _NS)
            src = content.get("src", "") if content is not None else ""
            file_part, _, fragment = src.partition("#")
            return NavPoint(
                nav_id=element.get("id", ""),
                title=(label.text or "").strip() if label is not None else "",
                href=file_part,
                fragment=fragment,
                level=level,
                children=[build(child, level + 1) for child in element.findall("./ncx:navPoint", _NS)],
            )

        return [build(point, 0) for point in nav_map.findall("./ncx:navPoint", _NS)]


def slugify(value: str, fallback: str = "work") -> str:
    slug = re.sub(r"[^\w\s-]", "", value.lower())
    slug = re.sub(r"[\s_]+", "-", slug).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    return slug or fallback
