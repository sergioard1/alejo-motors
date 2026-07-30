from __future__ import annotations

import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from lxml import etree


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"


def qn(name: str) -> str:
    return f"{{{W}}}{name}"


def set_run_text(run: etree._Element, value: str) -> None:
    texts = run.xpath("./w:t", namespaces=NS)
    if texts:
        texts[0].text = value
        texts[0].set(XML_SPACE, "preserve")
        for extra in texts[1:]:
            extra.getparent().remove(extra)
        return

    text = etree.SubElement(run, qn("t"))
    text.set(XML_SPACE, "preserve")
    text.text = value


def set_paragraph_text(paragraph: etree._Element, value: str) -> None:
    runs = paragraph.xpath("./w:r", namespaces=NS)
    if runs:
        set_run_text(runs[0], value)
        for extra in runs[1:]:
            paragraph.remove(extra)
        return

    run = etree.SubElement(paragraph, qn("r"))
    set_run_text(run, value)


def set_cell_text(cell: etree._Element, value: str) -> None:
    paragraphs = cell.xpath("./w:p", namespaces=NS)
    if not paragraphs:
        paragraphs = [etree.SubElement(cell, qn("p"))]
    set_paragraph_text(paragraphs[0], value)


def patch_agreement(root: etree._Element) -> None:
    body = root.find("w:body", NS)
    paragraphs = body.xpath("./w:p", namespaces=NS)
    tables = body.xpath("./w:tbl", namespaces=NS)

    set_paragraph_text(paragraphs[2], "AGREEMENT NO.: {dealNumber}")
    set_paragraph_text(
        paragraphs[3],
        "In the city of Fort Worth, Texas, on {saleDateLong}, this agreement is entered into between:",
    )
    set_paragraph_text(
        paragraphs[11],
        "The total purchase price of the vehicle under this agreement is ${totalPurchasePrice}, "
        "which shall be paid in full in cash at the time of signing this agreement. The Buyer "
        "acknowledges that the payment is final, with no further claims allowed, and that there "
        "are no additional agreements modifying the obligations herein. The Seller, in turn, "
        "certifies that full payment has been received and that no outstanding balance remains "
        "related to this transaction.",
    )

    buyer_rows = tables[0].xpath("./w:tr", namespaces=NS)
    for row, value in zip(
        buyer_rows,
        ("{buyerName}", "{buyerAddress}", "{buyerPhone}", "{buyerIdentification}"),
    ):
        set_cell_text(row.xpath("./w:tc", namespaces=NS)[1], value)

    vehicle_rows = tables[1].xpath("./w:tr", namespaces=NS)
    for row, value in zip(
        vehicle_rows,
        ("{vehicleMake}", "{vehicleModel}", "{vehicleYear}", "{vehicleVin}", "{vehicleMileage}"),
    ):
        set_cell_text(row.xpath("./w:tc", namespaces=NS)[1], value)

    buyer_signature_runs = paragraphs[22].xpath("./w:r", namespaces=NS)
    if len(buyer_signature_runs) >= 2:
        set_run_text(buyer_signature_runs[1], "Name: {buyerName}")


def patch_bill_of_sale(root: etree._Element) -> None:
    body = root.find("w:body", NS)
    paragraphs = body.xpath("./w:p", namespaces=NS)
    tables = body.xpath("./w:tbl", namespaces=NS)

    set_paragraph_text(
        paragraphs[3],
        "This Bill of Sale is executed on {saleDateLong}, between:",
    )
    set_paragraph_text(
        paragraphs[9],
        "The total purchase price of the vehicle is ${totalPurchasePrice}, which has been paid in "
        "full by the Buyer. The Seller acknowledges receipt of this payment and confirms no "
        "outstanding balances. The sale is final, and the vehicle is transferred 'as-is' with no "
        "warranties expressed or implied. The Buyer assumes full responsibility for the vehicle, "
        "including registration, taxes, and any required inspections.",
    )

    buyer_rows = tables[1].xpath("./w:tr", namespaces=NS)
    for row, value in zip(
        buyer_rows,
        ("{buyerName}", "{buyerAddress}", "{buyerPhone}", "{buyerIdentification}"),
    ):
        set_cell_text(row.xpath("./w:tc", namespaces=NS)[1], value)

    vehicle_rows = tables[2].xpath("./w:tr", namespaces=NS)
    for row, value in zip(
        vehicle_rows,
        (
            "{vehicleMake}",
            "{vehicleModel}",
            "{vehicleYear}",
            "{vehicleVin}",
            "{vehicleColor}",
            "{vehicleMileage}",
        ),
    ):
        set_cell_text(row.xpath("./w:tc", namespaces=NS)[1], value)

    buyer_signature_runs = paragraphs[21].xpath("./w:r", namespaces=NS)
    if len(buyer_signature_runs) >= 2:
        set_run_text(buyer_signature_runs[1], "Name: {buyerName}")


def write_template(source: Path, destination: Path, patcher) -> None:
    with ZipFile(source, "r") as source_zip:
        parts = {info.filename: (info, source_zip.read(info.filename)) for info in source_zip.infolist()}

    document_info, document_xml = parts["word/document.xml"]
    root = etree.fromstring(document_xml)
    patcher(root)
    patched_xml = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    parts["word/document.xml"] = (document_info, patched_xml)

    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, "w") as output_zip:
        for filename, (info, content) in parts.items():
            copied = ZipInfo(filename=filename, date_time=info.date_time)
            copied.compress_type = info.compress_type if info.compress_type is not None else ZIP_DEFLATED
            copied.comment = info.comment
            copied.extra = info.extra
            copied.internal_attr = info.internal_attr
            copied.external_attr = info.external_attr
            copied.create_system = info.create_system
            copied.flag_bits = info.flag_bits
            output_zip.writestr(copied, content)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--agreement", type=Path, required=True)
    parser.add_argument("--bill", type=Path, required=True)
    parser.add_argument("--outdir", type=Path, required=True)
    args = parser.parse_args()

    write_template(
        args.agreement,
        args.outdir / "vehicle-purchase-agreement-template.docx",
        patch_agreement,
    )
    write_template(
        args.bill,
        args.outdir / "bill-of-sale-template.docx",
        patch_bill_of_sale,
    )


if __name__ == "__main__":
    main()
