/**
 * Onenomad Bench — embeddable receipt widget
 *
 * Usage:
 *   <script src="https://bench.onenomad.dev/embed.js" data-receipt-id="<uuid>"></script>
 *
 * The script finds itself by src, reads data-receipt-id, fetches the receipt
 * summary from the public API, and renders a sandboxed iframe containing the
 * widget HTML inline via srcdoc. Zero external deps; no external CSS.
 */
;(function () {
  'use strict'

  var ORIGIN = 'https://bench.onenomad.dev'
  var COLORS = {
    bg: '#282828',
    bgBase: '#1d2021',
    border: '#504945',
    gold: '#fabd2f',
    green: '#b8bb26',
    red: '#fb4934',
    textPrimary: '#ebdbb2',
    textMuted: '#928374',
    textDisabled: '#665c54',
  }

  /** Locate the <script> tag that loaded this file */
  function getCurrentScript() {
    if (document.currentScript) return document.currentScript
    var scripts = document.getElementsByTagName('script')
    for (var i = scripts.length - 1; i >= 0; i--) {
      var s = scripts[i]
      if (s.src && s.src.indexOf('embed.js') !== -1) return s
    }
    return null
  }

  var script = getCurrentScript()
  if (!script) return

  var receiptId = script.getAttribute('data-receipt-id')
  if (!receiptId) {
    console.warn('[bench/embed] data-receipt-id attribute is required')
    return
  }

  /** Build the widget srcdoc HTML from receipt data */
  function buildHtml(data) {
    var r10 = data.scores && typeof data.scores.recall_at_10 === 'number'
      ? (data.scores.recall_at_10 * 100).toFixed(1) + '%'
      : '—'
    var ndcg = data.scores && typeof data.scores.ndcg_at_10 === 'number'
      ? (data.scores.ndcg_at_10 * 100).toFixed(1) + '%'
      : '—'
    var p50 = data.scores && typeof data.scores.latency_p50_ms === 'number'
      ? Math.round(data.scores.latency_p50_ms) + 'ms'
      : '—'
    var signedBadge = data.signed
      ? '<span style="color:' + COLORS.green + '">&#10003; signed</span>'
      : '<span style="color:' + COLORS.textDisabled + '">unsigned</span>'
    var date = data.ranAt ? new Date(data.ranAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : ''
    var detailUrl = ORIGIN + '/receipts/' + data.id

    return '<!DOCTYPE html>' +
      '<html><head><meta charset="utf-8">' +
      '<style>' +
      'body{margin:0;padding:0;font-family:Consolas,"JetBrains Mono","SF Mono",monospace;background:' + COLORS.bgBase + ';color:' + COLORS.textPrimary + ';font-size:12px;}' +
      '.widget{border:1px solid ' + COLORS.border + ';border-radius:8px;background:' + COLORS.bg + ';padding:12px 14px;display:flex;flex-direction:column;gap:8px;}' +
      '.header{display:flex;align-items:center;justify-content:space-between;gap:8px;}' +
      '.adapter{font-weight:600;color:' + COLORS.gold + ';}' +
      '.meta{font-size:10px;color:' + COLORS.textMuted + ';letter-spacing:.06em;text-transform:uppercase;}' +
      '.scores{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}' +
      '.score-item{}' +
      '.score-value{font-size:16px;font-weight:700;color:' + COLORS.gold + ';}' +
      '.score-label{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:' + COLORS.textDisabled + ';}' +
      '.footer{display:flex;align-items:center;justify-content:space-between;}' +
      'a{color:' + COLORS.gold + ';text-decoration:none;font-size:10px;}' +
      'a:hover{text-decoration:underline;}' +
      '</style></head><body>' +
      '<div class="widget">' +
      '<div class="header">' +
      '<div>' +
      '<span class="adapter">' + escHtml(data.adapter) + '</span>' +
      ' <span class="meta">v' + escHtml(data.version) + '</span>' +
      '<div class="meta">' + escHtml(data.benchmark) + '</div>' +
      '</div>' +
      '<div class="meta">' + signedBadge + '</div>' +
      '</div>' +
      '<div class="scores">' +
      '<div class="score-item"><div class="score-value">' + r10 + '</div><div class="score-label">R@10</div></div>' +
      '<div class="score-item"><div class="score-value">' + ndcg + '</div><div class="score-label">NDCG@10</div></div>' +
      '<div class="score-item"><div class="score-value">' + p50 + '</div><div class="score-label">p50</div></div>' +
      '</div>' +
      '<div class="footer">' +
      '<span class="meta">' + date + '</span>' +
      '<a href="' + detailUrl + '" target="_blank" rel="noopener noreferrer">View receipt &rarr;</a>' +
      '</div>' +
      '</div>' +
      '</body></html>'
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function renderError(container, msg) {
    container.style.cssText =
      'font-family:Consolas,monospace;font-size:11px;color:#928374;padding:8px;border:1px solid #504945;border-radius:6px;background:#282828;display:inline-block;'
    container.textContent = '[bench] ' + msg
  }

  /** Create a placeholder span next to the script tag */
  var container = document.createElement('span')
  container.style.display = 'inline-block'
  script.parentNode.insertBefore(container, script.nextSibling)

  /** Fetch the receipt summary from the public data index */
  var apiUrl = ORIGIN + '/api/receipts/' + encodeURIComponent(receiptId)

  fetch(apiUrl)
    .then(function (res) {
      if (!res.ok) throw new Error('receipt not found')
      return res.json()
    })
    .then(function (data) {
      var html = buildHtml(data)
      var iframe = document.createElement('iframe')
      iframe.sandbox = 'allow-popups allow-popups-to-escape-sandbox'
      iframe.srcdoc = html
      iframe.style.cssText = 'border:none;width:280px;height:130px;border-radius:8px;overflow:hidden;'
      iframe.scrolling = 'no'
      container.appendChild(iframe)
    })
    .catch(function (err) {
      renderError(container, err.message)
    })
})()
