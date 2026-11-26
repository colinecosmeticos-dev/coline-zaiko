// =========================================================
// Gera planilhas do Excel (.xlsx) direto no aparelho, sem internet.
// Um .xlsx é um pacote .zip com alguns arquivos de texto (XML) dentro.
// Aqui montamos esses arquivos e o .zip "na mão" (sem compressão).
//
// Uso:
//   gerarXlsx([{ nome: 'Resumo', larguras: [30, 14], linhas: [
//     [{ v: 'Título', estilo: 'negrito' }],
//     ['Faturamento', { v: 203.01, estilo: 'moeda' }]
//   ] }])  → Blob
// Valores: texto, número, null (célula vazia) ou { v, estilo }.
// Estilos: 'moeda' (1.234,56), 'negrito', 'titulo', 'moedaNegrito', 'inteiro' e,
// para o painel da aba Resumo (v0.33.0): faixa, subtitulo, kpiRotulo, kpiMoeda,
// kpiInteiro, kpiDetalhe, secao, cabecalho, pct, barra, total, totalMoeda,
// totalInteiro, rs, rsNegrito, sub, cabecalhoDir.
// Opções da aba: larguras, congelarLinha1, semGrade (esconde as linhas de grade),
// mesclar (['A1:I1', ...]), alturas ({ número da linha: altura em pontos }) e
// paisagem (imprime deitado, cabendo na largura da página).
// =========================================================

const ESTILOS = {
  normal: 0, moeda: 1, negrito: 2, titulo: 3, moedaNegrito: 4, inteiro: 5,
  faixa: 6, subtitulo: 7, kpiRotulo: 8, kpiMoeda: 9, kpiInteiro: 10, kpiDetalhe: 11,
  secao: 12, cabecalho: 13, pct: 14, barra: 15, total: 16, totalMoeda: 17, totalInteiro: 18,
  rs: 19, rsNegrito: 20, sub: 21, cabecalhoDir: 22, kpiPct: 23
};

const xmlEsc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function nomeColuna(i) {
  let s = '';
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

function celula(valor, ref) {
  if (valor == null || valor === '') return '';
  const obj = typeof valor === 'object' ? valor : { v: valor };
  const s = ESTILOS[obj.estilo] || 0;
  const atributoEstilo = s ? ` s="${s}"` : '';
  if (obj.v == null || obj.v === '') return s ? `<c r="${ref}"${atributoEstilo}/>` : '';
  if (typeof obj.v === 'number' && Number.isFinite(obj.v)) return `<c r="${ref}"${atributoEstilo}><v>${obj.v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${atributoEstilo}><is><t xml:space="preserve">${xmlEsc(obj.v)}</t></is></c>`;
}

function folha(aba) {
  const linhas = aba.linhas.map((linha, r) => {
    const cels = (linha || []).map((v, c) => celula(v, `${nomeColuna(c)}${r + 1}`)).join('');
    const h = aba.alturas && aba.alturas[r + 1];
    return `<row r="${r + 1}"${h ? ` ht="${h}" customHeight="1"` : ''}>${cels}</row>`;
  }).join('');
  const cols = aba.larguras && aba.larguras.length
    ? `<cols>${aba.larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const vista = aba.congelarLinha1 || aba.semGrade
    ? `<sheetViews><sheetView workbookViewId="0"${aba.semGrade ? ' showGridLines="0"' : ''}>${aba.congelarLinha1 ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : ''}</sheetView></sheetViews>` : '';
  const mesclas = aba.mesclar && aba.mesclar.length
    ? `<mergeCells count="${aba.mesclar.length}">${aba.mesclar.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${aba.paisagem ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : ''}${vista}${cols}<sheetData>${linhas}</sheetData>${mesclas}${aba.paisagem ? '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' : ''}</worksheet>`;
}

// Fontes: 0 normal, 1 negrito, 2 título 14, 3 faixa (branca 18), 4 cinza 9, 5 número grande 16,
// 6 seção (rosa 12), 7 cabeçalho (cinza 9 negrito), 8 barra (rosa), 9 cinza 10.
// Preenchimentos: 2 rosa (destaque), 3 cinza claro (cartões), 4 rosa claro (seções).
// Formatos: 164 = R$ 1.234,56 (negativo em vermelho).
const ESTILOS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00;[Red]-&quot;R$&quot; #,##0.00"/></numFmts>
<fonts count="10">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><name val="Calibri"/></font>
<font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><sz val="9"/><color rgb="FF6B6B6B"/><name val="Calibri"/></font>
<font><b/><sz val="16"/><color rgb="FF1F1F1F"/><name val="Calibri"/></font>
<font><b/><sz val="12"/><color rgb="FFD81B50"/><name val="Calibri"/></font>
<font><b/><sz val="9"/><color rgb="FF6B6B6B"/><name val="Calibri"/></font>
<font><sz val="11"/><color rgb="FFFF496F"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="FF6B6B6B"/><name val="Calibri"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFF496F"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF4F5F7"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFE8EE"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFD9D9D9"/></bottom><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF9E9E9E"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="24">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="9" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment indent="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="bottom" indent="1"/></xf>
<xf numFmtId="164" fontId="5" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" indent="1"/></xf>
<xf numFmtId="3" fontId="5" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" indent="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" indent="1"/></xf>
<xf numFmtId="0" fontId="6" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="7" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="9" fontId="9" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="8" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="3" fontId="1" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="9" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="7" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="9" fontId="4" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="top" indent="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export function gerarXlsx(abas) {
  const nomes = abas.map((a, i) => xmlEsc((a.nome || `Planilha${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)));
  const arquivos = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${nomes.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`],
    ['xl/styles.xml', ESTILOS_XML],
    ...abas.map((a, i) => [`xl/worksheets/sheet${i + 1}.xml`, folha(a)])
  ];
  return new Blob([zipSemCompressao(arquivos)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---------- .zip sem compressão ----------
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zipSemCompressao(arquivos) {
  const enc = new TextEncoder();
  const partes = [], central = [];
  let deslocamento = 0;
  for (const [nome, texto] of arquivos) {
    const nomeB = enc.encode(nome), dados = enc.encode(texto), crc = crc32(dados);
    const cab = new DataView(new ArrayBuffer(30));
    cab.setUint32(0, 0x04034b50, true); cab.setUint16(4, 20, true); cab.setUint16(6, 0x0800, true); // UTF-8 nos nomes
    cab.setUint16(8, 0, true); cab.setUint32(14, crc, true); cab.setUint32(18, dados.length, true); cab.setUint32(22, dados.length, true);
    cab.setUint16(26, nomeB.length, true);
    partes.push(new Uint8Array(cab.buffer), nomeB, dados);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, dados.length, true); c.setUint32(24, dados.length, true);
    c.setUint16(28, nomeB.length, true); c.setUint32(42, deslocamento, true);
    central.push(new Uint8Array(c.buffer), nomeB);
    deslocamento += 30 + nomeB.length + dados.length;
  }
  const tamanhoCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true); fim.setUint32(16, deslocamento, true);
  return new Blob([...partes, ...central, new Uint8Array(fim.buffer)]);
}
