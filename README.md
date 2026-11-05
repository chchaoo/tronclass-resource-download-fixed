# 畅课平台资源下载

为畅课（TronClass）课件添加下载按钮。

**[安装脚本](https://github.com/chchaoo/tronclass-resource-download-fixed/raw/refs/heads/main/%E7%95%85%E8%AF%BE%E5%B9%B3%E5%8F%B0%E8%B5%84%E6%BA%90%E4%B8%8B%E8%BD%BD.user.js)** · **[问题反馈](https://github.com/chchaoo/tronclass-resource-download-fixed/issues)**

## 功能

- 在附件旁添加下载按钮。
- 支持附件延迟加载、课件切换，避免重复按钮。
- 下载不预开空白标签页，异常时显示提示。

## 使用

1. 安装并启用 [Tampermonkey](https://www.tampermonkey.net/)。
2. 点击上方“安装脚本”，确认安装；若只显示代码，在油猴中新建脚本并粘贴保存。
3. 登录畅课平台，打开课件详情页，点击附件旁的“下载”。

已有页面请刷新；同类脚本只启用一个。没有开始下载时，可尝试“打开文件”。

> 下载格式与可用性取决于平台接口，请在资料授权范围内使用。脚本不要求填写账号密码。

## 开发

```sh
node --check 畅课平台资源下载.user.js
node --test verify.cjs
```

## 致谢与许可

基于 [BobLiu 的原项目](https://greasyfork.org/zh-CN/scripts/518886-畅课平台资源下载)（[GitHub](https://github.com/BobLiu0518/TronClass-Resource-Download)）修复按钮不显示等问题。

[MIT License](LICENSE) · 保留 BobLiu 原始版权声明，修改部分由 chchaoo 维护。
