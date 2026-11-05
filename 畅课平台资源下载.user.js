// ==UserScript==
// @name         畅课平台资源下载
// @namespace    https://github.com/chchaoo/tronclass-resource-download-fixed
// @version      1.0
// @license      MIT
// @description  为畅课课件增加下载按钮；适配新版附件列表及课件切换。
// @author       chchaoo
// @homepageURL  https://github.com/chchaoo/tronclass-resource-download-fixed
// @supportURL   https://github.com/chchaoo/tronclass-resource-download-fixed/issues
// @match        https://*/course/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * Maintained by chchaoo. This version fixes issues in the original script.
 * Upstream author: BobLiu (BobLiu0518), original script.
 * https://greasyfork.org/zh-CN/scripts/518886
 * https://github.com/BobLiu0518/TronClass-Resource-Download
 *
 * MIT License
 * Copyright (c) 2024 BobLiu
 * Copyright (c) 2026 chchaoo (modifications)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

(() => {
    'use strict';
    const BUTTON = 'tronclass-resource-download';
    const NOTICE = 'tronclass-download-notice';
    let activityId = null;
    let resources = [];
    let controller;
    let scanTimer;

    function getActivityId() {
        if (!/\/course\/[^/]+\/learning-activity\/?$/.test(location.pathname)) return null;
        // 部分页面地址会带第二个 #，不能把整个 hash 当作活动 ID。
        return location.hash.match(/^#\/(\d+)(?=$|[/?&#])/)?.[1] || null;
    }

    const normalize = value => String(value || '').normalize('NFC').trim();

    function rowName(row) {
        const name = row.querySelector('.file-name');
        if (!name) return '';
        // 新版页面把名称和扩展名分开；提示属性保留了完整原名。
        return normalize(name.getAttribute('tipsy-literal') ||
            name.getAttribute('original-title') || name.getAttribute('title') ||
            (name.textContent.trim() + (row.querySelector('.file-extension')?.textContent.trim() || '')));
    }

    async function json(url, signal) {
        const response = await fetch(url, {credentials: 'same-origin', signal});
        if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
        try { return await response.json(); }
        catch { throw new Error('接口未返回有效 JSON，请确认登录状态'); }
    }

    function clearNotice() { document.getElementById(NOTICE)?.remove(); }

    function showError(error) {
        console.error('[畅课资源下载]', error);
        clearNotice();
        const list = document.querySelector('.attachment-body');
        if (!list) return;
        const notice = document.createElement('div');
        notice.id = NOTICE;
        notice.setAttribute('role', 'alert');
        notice.style.cssText = 'padding:8px;color:#a12622;background:#fff4ef;';
        notice.appendChild(document.createTextNode(`资源下载：${error.message}。`));
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = '重试';
        retry.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            activityId = null;
            scan();
        };
        notice.appendChild(retry);
        list.before(notice);
    }

    async function load(id) {
        controller?.abort();
        controller = new AbortController();
        const request = controller;
        try {
            const data = await json(`/api/activities/${id}/upload_references`, request.signal);
            if (request.signal.aborted || activityId !== id || getActivityId() !== id) return;
            if (!Array.isArray(data.references)) throw new Error('附件接口格式变化，缺少 references 列表');
            resources = data.references.filter(resource => resource && resource.id != null);
            inject();
        } catch (error) {
            if (!request.signal.aborted && getActivityId() === id) showError(error);
        }
    }

    async function download(resource, button, id) {
        button.disabled = true;
        button.textContent = '获取中…';
        try {
            const data = await json(`/api/uploads/reference/document/${encodeURIComponent(resource.id)}/url`);
            if (getActivityId() !== id) return;
            if (typeof data.url !== 'string' || !data.url.trim()) throw new Error('服务器未返回下载地址');
            const url = new URL(data.url, location.origin);
            if (!['https:', 'http:'].includes(url.protocol)) throw new Error('下载地址协议不受支持');
            // 附件响应交给浏览器下载，不预开 about:blank 标签页。
            // 每次使用独立框架，避免连续点击时覆盖尚未启动的下载。
            // 框架随课件页面关闭而销毁，不定时删除，以免中断慢速响应。
            const frame = document.createElement('iframe');
            frame.hidden = true;
            frame.title = `下载 ${resource.name}`;
            frame.setAttribute('aria-hidden', 'true');
            frame.src = url.href;
            document.body.appendChild(frame);

            // 服务器如果改为返回在线预览，用户仍可主动打开真实文件地址。
            // 不自动打开新标签，每次替换上一次取得的签名链接。
            rowLinks(button).forEach(link => link.remove());
            const link = document.createElement('a');
            link.href = url.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = '打开文件';
            link.className = `${BUTTON} tronclass-resource-file-link`;
            link.style.cssText = 'margin-left:8px;';
            link.onclick = event => event.stopPropagation();
            button.after(link);
            clearNotice();
        } catch (error) {
            showError(error);
        } finally {
            button.disabled = false;
            button.textContent = '下载';
        }
    }

    function rowLinks(button) {
        return button.parentElement.querySelectorAll('.tronclass-resource-file-link');
    }

    function inject() {
        if (getActivityId() !== activityId) return;
        const byName = new Map();
        for (const resource of resources) {
            const name = normalize(resource.name);
            if (!byName.has(name)) byName.set(name, []);
            byName.get(name).push(resource);
        }
        const seen = new Map();
        for (const row of document.querySelectorAll('.attachment-body .attachment-row')) {
            const name = rowName(row);
            const index = seen.get(name) || 0;
            seen.set(name, index + 1);
            const matches = byName.get(name) || [];
            const resource = matches[index];
            const existing = row.querySelector(`button.${BUTTON}`);
            if (existing && resource && existing.dataset.resourceId === String(resource.id)) continue;
            row.querySelectorAll(`.${BUTTON}`).forEach(node => node.remove());
            if (!resource) continue;
            const host = row.querySelector('.file-name-row') || row.querySelector('.file-info');
            if (!host) continue;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = BUTTON;
            button.dataset.resourceId = String(resource.id);
            button.textContent = '下载';
            button.title = `下载 ${resource.name}`;
            button.style.cssText = 'margin-left:12px;padding:2px 10px;color:#fff;background:#1677c8;border:0;border-radius:3px;cursor:pointer;flex-shrink:0;';
            const id = activityId;
            button.onclick = event => {
                event.preventDefault();
                event.stopPropagation();
                if (getActivityId() === id) download(resource, button, id);
            };
            host.appendChild(button);
        }
    }

    function scan() {
        const id = getActivityId();
        if (id !== activityId) {
            activityId = id;
            resources = [];
            controller?.abort();
            document.querySelectorAll(`.${BUTTON}`).forEach(node => node.remove());
            clearNotice();
            if (id) void load(id);
        } else if (id) inject();
    }

    // 不等待 load 事件；附件晚到、框架重新渲染时持续补齐，且不重复创建按钮。
    new MutationObserver(() => {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(scan, 100);
    }).observe(document.documentElement, {childList: true, subtree: true, characterData: true});
    window.addEventListener('hashchange', scan);
    window.addEventListener('popstate', scan);
    // 同时覆盖框架使用 pushState 切换页面（不会触发 hashchange）的情形。
    setInterval(scan, 1000);
    scan();
})();
