"""Small source-format fixtures verify units, suppression and fail-closed decoding."""
import importlib.util
import io
import unittest
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

spec = importlib.util.spec_from_file_location('decode_bls', Path(__file__).with_name('decode-bls.py'))
decoder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(decoder)


def xlsx(rows, name):
    out = io.BytesIO()
    xml_rows = []
    for index, row in enumerate(rows, 1):
        cells = ''.join(f'<c r="{column}{index}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>' for column, value in row.items())
        xml_rows.append(f'<row r="{index}">{cells}</row>')
    with zipfile.ZipFile(out, 'w') as archive:
        archive.writestr('xl/workbook.xml', f'<workbook xmlns="{decoder.NS["s"]}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="{name}" sheetId="1" r:id="rId1"/></sheets></workbook>')
        archive.writestr('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
        archive.writestr('xl/worksheets/sheet1.xml', f'<worksheet xmlns="{decoder.NS["s"]}"><sheetData>{"".join(xml_rows)}</sheetData></worksheet>')
    return out.getvalue()


class BlsSemantics(unittest.TestCase):
    def test_annual_openings_are_converted_from_thousands(self):
        records = decoder.projections(xlsx([
            {'A': 'Employment in thousands'},
            {'A': 'Title', 'B': 'SOC', 'C': 'Occupation type', 'D': 'Employment 2025', 'E': 'Employment 2035', 'I': 'Employment change, percent', 'K': 'Openings, annual average'},
            {'A': 'Software Developers', 'B': '15-1252', 'C': 'Line item', 'I': '12.5', 'K': '123.4'},
            {'A': 'Summary excluded', 'B': '15-0000', 'C': 'Summary', 'I': '2', 'K': '999'},
        ], 'Table 1.2'))
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]['annual_openings'], 123400)
        self.assertEqual((records[0]['base_year'], records[0]['end_year']), (2025, 2035))

    def test_suppressed_annual_wage_stays_missing_without_annualizing_hourly(self):
        columns = ['PRIM_STATE', 'AREA_TITLE', 'NAICS', 'I_GROUP', 'OWN_CODE', 'OCC_CODE', 'O_GROUP', 'A_MEDIAN', 'H_MEDIAN']
        letters = list('ABCDEFGHI')
        headers = dict(zip(letters, columns))
        values = dict(zip(letters, ['OH', 'Ohio', '000000', 'cross-industry', '1235', '15-1252', 'detailed', '#', '42.5']))
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w') as output:
            output.writestr('state_M2025_dl.xlsx', xlsx([headers, values], 'Sheet1'))
        record = decoder.wages(archive.getvalue())[0]
        self.assertIsNone(record['median_annual'])
        self.assertEqual(record['annual_marker'], '#')
        self.assertEqual(record['median_hourly'], 42.5)
        self.assertEqual((record['region'], record['year']), ('OH', 2025))

    def test_changed_projection_units_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'units changed'):
            decoder.projections(xlsx([{'A': 'Employment in individual jobs'}, {'C': 'Occupation type'}], 'Table 1.2'))


if __name__ == '__main__':
    unittest.main()
