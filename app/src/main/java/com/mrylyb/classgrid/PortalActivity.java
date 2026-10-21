package com.mrylyb.classgrid;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.net.http.SslError;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

/** The school page runs in its own WebView. No JavaScript bridge is attached. */
public class PortalActivity extends Activity {
    private WebView web;
    private static final String EXTRACT = """
        (function(){
          const found=[];
          function scan(win, depth){
            if(depth>4)return;
            let doc;
            try{doc=win.document;if(!doc||!doc.body)return;}catch(e){return;}
            for(const table of Array.from(doc.querySelectorAll('table'))){
              const hint=(table.innerText||'').replace(/\\s/g,'');
              const weekdays=['星期一','星期二','星期三','星期四','星期五','星期六','星期日'];
              if(weekdays.filter(x=>hint.includes(x)).length<3 ||
                 !(hint.includes('第1节')||hint.includes('第１节')||hint.includes('时间')))continue;
              const rows=Array.from(table.rows||[]).slice(0,80).map(row=>
                Array.from(row.cells||[]).slice(0,12).map(cell=>({
                  text:(cell.innerText||cell.textContent||'').slice(0,1800),
                  rowSpan:Math.max(1,Math.min(20,Number(cell.rowSpan)||1)),
                  colSpan:Math.max(1,Math.min(8,Number(cell.colSpan)||1))
                })));
              found.push({rows:rows});
              if(found.length>=4)return;
            }
            for(const frame of Array.from(doc.querySelectorAll('iframe,frame'))){
              try{if(frame.contentWindow)scan(frame.contentWindow,depth+1);}catch(e){}
            }
          }
          scan(window,0);
          return JSON.stringify({tables:found,source:'教务系统页面'});
        })()
        """;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(247, 249, 251));
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setPadding(dp(12), dp(8), dp(12), dp(8));
        Button back = new Button(this);
        back.setText("返回");
        back.setOnClickListener(v -> finish());
        bar.addView(back, new LinearLayout.LayoutParams(dp(72), dp(48)));
        TextView title = new TextView(this);
        title.setText("登录后进入课表页面");
        title.setTextSize(14);
        title.setTextColor(Color.rgb(36, 51, 70));
        title.setGravity(android.view.Gravity.CENTER_VERTICAL);
        bar.addView(title, new LinearLayout.LayoutParams(0, dp(48), 1));
        Button extract = new Button(this);
        extract.setText("提取");
        extract.setOnClickListener(v -> extract());
        bar.addView(extract, new LinearLayout.LayoutParams(dp(72), dp(48)));
        root.addView(bar);
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (allowed(request.getUrl())) return false;
                Toast.makeText(PortalActivity.this, "仅允许学校 HTTPS 页面", Toast.LENGTH_SHORT).show();
                return true;
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                Toast.makeText(PortalActivity.this, "学校页面证书异常，已停止加载", Toast.LENGTH_LONG).show();
            }
            @Override public void onPageFinished(WebView view, String url) {
                try { title.setText(Uri.parse(url).getHost() + " · 进入课表后提取"); }
                catch (Exception ignored) {}
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
        Uri start = Uri.parse(getIntent().getStringExtra("url"));
        web.loadUrl(allowed(start) ? start.toString() : "https://jws.syuct.edu.cn/");
    }

    private static boolean allowed(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) return false;
        String host = uri.getHost();
        return host != null && uri.getUserInfo() == null;
    }

    private void extract() {
        String current = web.getUrl();
        if (current == null || !allowed(Uri.parse(current))) {
            Toast.makeText(this, "请先打开学校课表页面", Toast.LENGTH_SHORT).show(); return;
        }
        web.evaluateJavascript(EXTRACT, result -> {
            try {
                Object decoded = new JSONTokener(result).nextValue();
                JSONObject data = new JSONObject(String.valueOf(decoded));
                JSONArray tables = data.optJSONArray("tables");
                if (tables == null || tables.length() == 0) {
                    Toast.makeText(this, "未找到完整课表，请进入“学生个人课表”后重试", Toast.LENGTH_LONG).show();
                    return;
                }
                if (data.toString().length() > 400000) {
                    Toast.makeText(this, "课表页面过大，改用文件导入", Toast.LENGTH_LONG).show(); return;
                }
                Intent answer = new Intent();
                answer.putExtra("payload", data.toString());
                setResult(RESULT_OK, answer);
                finish();
            } catch (Exception e) {
                Toast.makeText(this, "课表读取失败", Toast.LENGTH_LONG).show();
            }
        });
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        CookieManager.getInstance().removeAllCookies(null);
        super.onDestroy();
    }
}
