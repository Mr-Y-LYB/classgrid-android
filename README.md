# ClassGrid

安卓本地课程表。无广告、无账号；课程、节次和提醒设置保存在手机内。教务系统导入与检查更新需要联网。

## 使用

1. 新建或打开课表，设置第一周周一和总周数。
2. 点击“添加”录入课程；一门课可设置多个星期、节次和周次。
3. 点击课程可编辑整门课，或只调整、取消这一次上课；原时段会保留可点击的调课或停课提示。
4. “导入”支持 CSV、XLSX 模板及网页课表。沈阳化工大学本科生可在应用内登录 `https://jws.syuct.edu.cn/`，进入“学生个人课表”后点击“提取”。所有导入均先预览，再选择新建、追加或替换。
5. “设置”中可修改节次时间、开启本地提醒、导出 JSON 备份或 ICS 日历。

教务登录表单由学校网页提供；应用不保存账号、密码或 Cookie。退出教务页面后清除网页 Cookie。学校页面若发生变更，可使用文件或手动导入。沈化页面解析已按公开格式和脱敏结构样本测试，尚需在学校系统恢复登录后进行真人实测。

## 文件模板

在“导入”中下载 CSV 模板。Excel `.xlsx` 文件使用同样的表头：`课程,教师,教室,星期,开始节,结束节,周次`。每行是一个上课时段；同名、同教师、同教室的时段合并为一门课。周次支持 `1-16`、`1-16单`、`2-16双`、`1,3,5`。

## 构建

需要 JDK 17、Android SDK 35。使用 Android Studio 打开项目，或运行：

```powershell
.\gradlew.bat assembleDebug
node .\tests\core.test.js
```

发布版需将本地签名文件放在 `.signing/classgrid.jks`，并在 `.signing/signing.properties` 写入 `password=...`。这两个文件被 Git 忽略；后续版本必须使用同一个签名密钥。发布版构建命令为 `.\gradlew.bat assembleRelease`。

## 设计参考

周视图的信息排布参考用户提供的 WakeUp 课程表分析。中性色画布、浅色分隔线、圆角控件与紧凑间距参考 [VoltAgent/awesome-design-md 中的 Cal.com 分析](https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/cal)。界面与图标均为 ClassGrid 自行实现。

## 数据与更新

课程数据只写入本机应用私有目录。JSON 备份与 ICS 文件仅在用户选择保存位置后导出。联网进入应用时自动检查本仓库的 GitHub Release；用户确认下载后，应用校验 APK 的 SHA-256、包名和签名，再由系统安装界面确认更新。断网时课表照常使用。

