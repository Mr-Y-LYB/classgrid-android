from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import sys

out = Path(sys.argv[1])
out.parent.mkdir(parents=True, exist_ok=True)
strings = ['课程', '教师', '教室', '星期', '开始节', '结束节', '周次',
           '高等数学', '张老师', 'A101', '一', '1-16单']
shared = '<?xml version="1.0" encoding="utf-8"?>' + \
    '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + \
    ''.join(f'<si><t>{value}</t></si>' for value in strings) + '</sst>'
rows = [[0, 1, 2, 3, 4, 5, 6], [7, 8, 9, 10, None, None, 11]]
sheet = '<?xml version="1.0" encoding="utf-8"?>' + \
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
for row_num, row in enumerate(rows, 1):
    sheet += f'<row r="{row_num}">'
    for col_num, value in enumerate(row):
        col = chr(ord('A') + col_num)
        if value is None:
            text = '1' if col_num == 4 else '2'
            sheet += f'<c r="{col}{row_num}"><v>{text}</v></c>'
        else:
            sheet += f'<c r="{col}{row_num}" t="s"><v>{value}</v></c>'
    sheet += '</row>'
sheet += '</sheetData></worksheet>'
with ZipFile(out, 'w', ZIP_DEFLATED) as z:
    z.writestr('xl/sharedStrings.xml', shared)
    z.writestr('xl/worksheets/sheet1.xml', sheet)
