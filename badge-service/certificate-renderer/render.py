"""Render one frozen certificate snapshot from stdin to PDF on stdout; no network/file input."""
import sys, json, io, base64, os
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
import reportlab
from PIL import Image

font_path = os.environ.get('CERTIFICATE_FONT_REGULAR') or str(Path(reportlab.__file__).parent / 'fonts/Vera.ttf')
pdfmetrics.registerFont(TTFont('CertificateSans', font_path))

def render(s):
    d = s['design']; out = io.BytesIO()
    for name in s.get('validateNames', []):
        cmap = pdfmetrics.getFont('CertificateSans').face.charToGlyph
        if any(ord(ch) not in cmap for ch in name if not ch.isspace()):
            raise ValueError('Certificate font does not support one or more characters. Configure a Unicode font or use a supported name.')
        line = ''; lines = 1
        for word in name.split():
            if pdfmetrics.stringWidth(word,'CertificateSans',22)>660: raise ValueError('Certificate text is too long to fit. Shorten the text.')
            trial = (line+' '+word).strip()
            if pdfmetrics.stringWidth(trial,'CertificateSans',22)>660: lines += 1; line = word
            else: line = trial
        if lines>2: raise ValueError('Certificate text is too long to fit. Shorten the text.')
    paper = (841.8898, 595.2756) if d['paper'] == 'a4' else (792, 612)
    c = canvas.Canvas(out, pagesize=paper, invariant=1, pageCompression=1)
    c.setTitle(d['title'] + ' - ' + s['recipientName']); c.setAuthor(s['issuer'])
    c.setSubject('Certificate for recorded award ' + s['badgeId'])
    c.scale(paper[0]/792, paper[1]/612)
    blue, gold = HexColor(d['primary']), HexColor(d['accent'])
    ink, muted = HexColor('#142E40'), HexColor('#536675')
    def txt(text, y, size=13, color=ink, width=650, lines=2, font='CertificateSans', x=396, align='center'):
        # Reject unsupported glyphs rather than silently generating empty boxes.
        if font == 'CertificateSans':
            cmap = pdfmetrics.getFont(font).face.charToGlyph
            if any(ord(ch) not in cmap for ch in text if not ch.isspace()):
                raise ValueError('Certificate font does not support one or more characters. Configure a Unicode font or use a supported name.')
        words = text.split(); result = []; line = ''
        for word in words:
            trial = (line + ' ' + word).strip()
            if pdfmetrics.stringWidth(trial,font,size)>width:
                if line: result.append(line); line = word
                else: raise ValueError('Certificate text is too long to fit. Shorten the text.')
            else: line = trial
        if line: result.append(line)
        if len(result)>lines: raise ValueError('Certificate text is too long to fit. Shorten the text.')
        c.setFillColor(color); c.setFont(font,size)
        for i,line in enumerate(result):
            if align == 'left': c.drawString(x,y-i*(size*1.25),line)
            else: c.drawCentredString(x,y-i*(size*1.25),line)
        return len(result)
    c.setFillColor(HexColor('#FFFFFF'));c.rect(0,0,792,612,fill=1,stroke=0)
    if d['style']=='classic':
        c.setStrokeColor(gold);c.setLineWidth(2);c.rect(26,26,740,560,fill=0,stroke=1)
        c.setStrokeColor(blue);c.setLineWidth(.6);c.rect(34,34,724,544,fill=0,stroke=1)
        for x,y,sx,sy in [(42,570,1,-1),(750,570,-1,-1),(42,42,1,1),(750,42,-1,1)]:
            c.setLineWidth(2);c.line(x,y,x+28*sx,y);c.line(x,y,x,y+28*sy)
    else:
        c.setFillColor(blue);c.rect(0,0,24,612,fill=1,stroke=0);c.rect(0,588,792,24,fill=1,stroke=0)
        c.setFillColor(gold);c.rect(24,0,5,612,fill=1,stroke=0);c.rect(29,582,763,6,fill=1,stroke=0)
        c.setStrokeColor(HexColor('#D8E1E7'));c.setLineWidth(.6);c.rect(44,28,720,536,fill=0,stroke=1)
    def image_field(key, x, y, width, height):
        _, encoded = d[key].split(',',1); raw = base64.b64decode(encoded,validate=True)
        image = Image.open(io.BytesIO(raw)); image.verify(); image = Image.open(io.BytesIO(raw))
        if image.width * image.height > 16000000:
            label = 'logo' if key == 'logo' else 'signature image'
            raise ValueError('Certificate ' + label + ' is too large.')
        image.thumbnail((600 if key == 'logo' else 800,400))
        c.drawImage(ImageReader(image),x=x,y=y,width=width,height=height,preserveAspectRatio=True,anchor='c',mask='auto')
    header = d.get('header','').strip()
    if header:
        txt(header,550,size=11,color=blue,width=270,lines=3,x=60,align='left')
    if d.get('logo'):
        image_field('logo',357,512,78,40)
    org_y=490 if header or d.get('logo') else 523
    txt(s['issuer'],org_y,size=18,color=blue,width=640,lines=2)
    txt(d['department'],org_y-24,size=10,color=muted,width=620,lines=1)
    txt(d['title'],435,size=30,color=blue,width=650,lines=1,font='CertificateSans')
    c.setStrokeColor(gold);c.setLineWidth(2);c.line(316,414,476,414)
    txt(d['introduction'],388,size=12,color=muted,width=650,lines=2)
    name=s['recipientName']; name_size=36
    while name_size>22 and pdfmetrics.stringWidth(name,'CertificateSans',name_size)>660: name_size-=1
    txt(name,338,size=name_size,color=blue,width=660,lines=2)
    txt(d['completionText'],277,size=11,color=muted,width=650,lines=1)
    txt(s['achievement'],246,size=21,color=blue,width=640,lines=2)
    txt(d['closing'],190,size=11,color=muted,width=630,lines=2)
    if d.get('signatureImage'):
        image_field('signatureImage',296,136,200,34)
    c.setStrokeColor(gold);c.setLineWidth(.8);c.line(276,128,516,128)
    txt(d['signerName'],112,size=12,width=400,lines=1)
    txt(d['signerTitle'],96,size=10,color=muted,width=500,lines=1)
    txt('Awarded ' + s['awardDate'],72,size=10,color=ink,width=680,lines=1)
    txt(d['footer'],55,size=8,color=muted,width=690,lines=1)
    txt('Certificate ' + s['id'] + ' | Award ' + s['badgeId'],43,size=6,color=muted,width=710,lines=1)
    if s.get('demo') or s.get('preview'):
        c.saveState();c.translate(396,310);c.rotate(24);c.setFillColor(Color(.0,.23,.39,alpha=.09));c.setFont('CertificateSans',58);c.drawCentredString(0,0,'SAMPLE' if s.get('preview') else 'FICTIONAL TEST');c.restoreState()
    c.showPage();c.save();return out.getvalue()
try:
    payload=json.load(sys.stdin)
    sys.stdout.buffer.write(render(payload))
except Exception as error:
    message=str(error) if isinstance(error,ValueError) else 'Certificate PDF could not be rendered. Check the renderer configuration and image.'
    print(message,file=sys.stderr);sys.exit(1)
