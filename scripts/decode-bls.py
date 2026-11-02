"""Read official OEWS XLSX archives and EP Table 1.2 without executing workbook content."""
import io,json,re,sys,zipfile,posixpath,xml.etree.ElementTree as ET
from pathlib import Path
NS={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
def workbook(data,sheet_name=None):
    z=zipfile.ZipFile(io.BytesIO(data))
    if sum(i.file_size for i in z.infolist())>300*1024*1024:raise ValueError('Workbook exceeds import limit')
    strings=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        strings=[''.join(n.itertext())for n in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',NS)]
    sheets=ET.fromstring(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet',NS)
    sheet=next((s for s in sheets if s.get('name')==sheet_name),None)if sheet_name else sheets[0]
    if sheet is None:raise ValueError('Expected BLS worksheet is missing')
    relations={r.get('Id'):r.get('Target')for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    target=relations[sheet.get(REL)];target=target.lstrip('/')if target.startswith('/')else posixpath.normpath('xl/'+target)
    if not target.startswith('xl/worksheets/'):raise ValueError('Unexpected worksheet location')
    rows=[]
    for row in ET.fromstring(z.read(target)).findall('s:sheetData/s:row',NS):
        values={}
        for c in row.findall('s:c',NS):
            ref=re.match(r'[A-Z]+',c.get('r')).group();v=c.find('s:v',NS);value=v.text if v is not None else ''.join(c.find('s:is',NS).itertext())if c.find('s:is',NS)is not None else ''
            if c.get('t')=='s'and value:value=strings[int(value)]
            values[ref]=value or ''
        rows.append(values)
    return rows
def number(value):
    if value in ('','*','**','#','—','-'):return None
    n=float(str(value).replace(',',''))
    if not (-1e12<n<1e12):raise ValueError('Invalid numeric source value')
    return n
def wages(data):
    outer=zipfile.ZipFile(io.BytesIO(data));files=[f for f in outer.namelist()if f.endswith('.xlsx')]
    if len(files)!=1:raise ValueError('Expected one OEWS workbook')
    filename=files[0];year_match=re.search(r'M(\d{4})',filename)
    if not year_match:raise ValueError('Unknown OEWS reference year')
    year=int(year_match.group(1));rows=workbook(outer.read(filename));header=rows[0]
    required={'PRIM_STATE','AREA_TITLE','NAICS','I_GROUP','OWN_CODE','OCC_CODE','O_GROUP','A_MEDIAN','H_MEDIAN'}
    if not required.issubset(set(header.values())):raise ValueError('OEWS columns changed; review source schema')
    records=[]
    for row in rows[1:]:
        r={name:row.get(col,'')for col,name in header.items()}
        if r.get('O_GROUP')!='detailed'or r.get('NAICS')!='000000'or r.get('I_GROUP')!='cross-industry'or r.get('OWN_CODE')!='1235':continue
        if not re.fullmatch(r'\d{2}-\d{4}',r['OCC_CODE'])or not re.fullmatch(r'[A-Z]{2}',r['PRIM_STATE']):raise ValueError('Invalid wage occupation/region')
        annual=number(r['A_MEDIAN']);hourly=number(r['H_MEDIAN'])
        if annual is not None and annual<0 or hourly is not None and hourly<0:raise ValueError('Negative wage')
        records.append(dict(soc_code=r['OCC_CODE'],region=r['PRIM_STATE'],region_name='United States'if r['PRIM_STATE']=='US'else r['AREA_TITLE'],year=year,median_annual=annual,median_hourly=hourly,annual_marker=r['A_MEDIAN']or None if annual is None else None,hourly_marker=r['H_MEDIAN']or None if hourly is None else None))
    if not records:raise ValueError('No detailed occupation wages found')
    return records
def projections(data):
    rows=workbook(data,'Table 1.2');title=rows[0].get('A','');h=rows[1]
    if 'Employment in thousands'not in title or 'Employment change, percent'not in h.get('I','')or 'annual average'not in h.get('K','')or h.get('C')!='Occupation type':raise ValueError('Projection columns/units changed; review source schema')
    base=int(re.search(r'\d{4}',h['D']).group());end=int(re.search(r'\d{4}',h['E']).group());records=[]
    for r in rows[2:]:
        if r.get('C')!='Line item':continue
        if not re.fullmatch(r'\d{2}-\d{4}',r.get('B','')):raise ValueError('Invalid projection occupation')
        openings=number(r.get('K',''))
        if openings is not None and openings<0:raise ValueError('Negative job openings')
        records.append(dict(soc_code=r['B'],title=r.get('A','').strip(),base_year=base,end_year=end,percent_change=number(r.get('I','')),annual_openings=None if openings is None else round(openings*1000)))
    if not records:raise ValueError('No detailed occupation projections found')
    return records
if __name__=='__main__':
    directory=Path(sys.argv[1]);result={'wages':wages((directory/'national.zip').read_bytes())+wages((directory/'state.zip').read_bytes()),'projections':projections((directory/'projections.xlsx').read_bytes())}
    print(json.dumps(result,separators=(',',':'),allow_nan=False))
