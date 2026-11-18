package com.mrylyb.classgrid;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.net.http.SslError;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.nio.charset.StandardCharsets;

/** Remote school pages never receive the application's native JavaScript bridge. */
public class PortalActivity extends Activity {
    private WebView web;
    private TextView title, status;
    private Button extract;
    private ProgressBar progress;
    private boolean loading, extracting, dark;
    private String script;
    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
    private int generation;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        try {
            org.json.JSONObject state = new JSONObject(new String(java.nio.file.Files.readAllBytes(new java.io.File(getFilesDir(), "classgrid.json").toPath()),StandardCharsets.UTF_8));
            dark = "dark".equals(state.optJSONObject("settings").optString("theme"));
        } catch (Exception ignored) {}
        int surface=Color.parseColor(dark?"#111318":"#f8f9ff"), ink=Color.parseColor(dark?"#e3e5ec":"#191c20");
        getWindow().setStatusBarColor(surface);getWindow().setNavigationBarColor(surface);
        getWindow().getDecorView().setSystemUiVisibility(dark?0:android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        LinearLayout root = new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(surface);
        LinearLayout bar = new LinearLayout(this);bar.setGravity(android.view.Gravity.CENTER_VERTICAL);bar.setPadding(dp(12),dp(8),dp(12),dp(8));
        Button back = pill("返回",false);back.setOnClickListener(v->onBackPressed());bar.addView(back,new LinearLayout.LayoutParams(dp(72),dp(48)));
        title = new TextView(this);title.setText("教务系统");title.setTextSize(17);title.setTypeface(null,Typeface.BOLD);title.setTextColor(ink);title.setPadding(dp(14),0,dp(8),0);
        bar.addView(title,new LinearLayout.LayoutParams(0,dp(48),1));title.setGravity(android.view.Gravity.CENTER_VERTICAL);
        extract=pill("提取",true);extract.setOnClickListener(v->extract());bar.addView(extract,new LinearLayout.LayoutParams(dp(80),dp(48)));root.addView(bar);
        status=new TextView(this);status.setTextColor(ink);status.setTextSize(12);status.setPadding(dp(20),dp(6),dp(20),dp(10));root.addView(status);
        progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);root.addView(progress,new LinearLayout.LayoutParams(-1,dp(3)));
        web=new WebView(this);web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        web.getSettings().setUseWideViewPort(true);
        web.getSettings().setLoadWithOverviewMode(true);
        web.getSettings().setSupportZoom(true);
        web.getSettings().setBuiltInZoomControls(true);
        web.getSettings().setDisplayZoomControls(false);
        if((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0)WebView.setWebContentsDebuggingEnabled(true);
        web.setWebChromeClient(new WebChromeClient(){@Override public void onProgressChanged(WebView view,int value){progress.setProgress(value);}});
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                if(allowed(request.getUrl()))return false;
                status.setText("此链接不是 HTTPS 页面，无法打开");return true;
            }
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){loading=true;extract.setEnabled(false);status.setText("正在加载教务页面…");progress.setVisibility(android.view.View.VISIBLE);}
            @Override public void onPageFinished(WebView view,String url){loading=false;extract.setEnabled(!extracting);progress.setVisibility(android.view.View.GONE);status.setText("登录后进入完整学期课表，再点击提取");}
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame()){loading=false;status.setText("教务页面加载失败，请检查网络后重试");}}
            @Override public void onReceivedSslError(WebView view,SslErrorHandler ssl,SslError error){ssl.cancel();loading=false;status.setText("教务页面证书异常，无法加载");}
        });
        root.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
        try {
            String extractor=asset("portal-extract.js"),model=asset("model.js"),parser=asset("import.js");
            // Scope parser globals to an isolated object, not the remote page's window.
            script="(function(){const data=JSON.parse("+extractor+");if(data.tables.length){try{const result=(function(){const globalThis={},module=undefined;"+model+parser+";return globalThis.CGImport.parsePortal(data,30);})();data.diagnostics.issues=result.issues;data.diagnostics.courses=result.courses.length;}catch(error){data.diagnostics.status='parse_error';data.diagnostics.message=String(error.message).slice(0,240);}}return JSON.stringify(data);})()";
        }catch(Exception error){status.setText("课表读取组件不可用，请重新安装应用");extract.setEnabled(false);}
        Uri start=Uri.parse(getIntent().getStringExtra("url")==null?"https://jws.syuct.edu.cn/":getIntent().getStringExtra("url"));
        web.loadUrl(allowed(start)?start.toString():"https://jws.syuct.edu.cn/");
    }
    private String asset(String name)throws Exception{try(java.io.InputStream input=getAssets().open(name)){java.io.ByteArrayOutputStream output=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[8192];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);return output.toString("UTF-8");}}
    private Button pill(String label,boolean primary){
        Button button=new Button(this);button.setText(label);button.setAllCaps(false);button.setTextSize(14);button.setMinWidth(0);button.setMinimumWidth(0);button.setPadding(dp(10),0,dp(10),0);
        int bg=Color.parseColor(primary?(dark?"#8fcdff":"#006b9a"):(dark?"#252b35":"#e8edf6"));
        button.setTextColor(Color.parseColor(primary?(dark?"#00344e":"#ffffff"):(dark?"#cee5ff":"#06324b")));
        GradientDrawable shape=new GradientDrawable();shape.setColor(bg);shape.setCornerRadius(dp(28));button.setBackground(new android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(0x20000000),shape,null));return button;
    }
    private static boolean allowed(Uri uri){return uri!=null&&"https".equalsIgnoreCase(uri.getScheme())&&uri.getHost()!=null&&uri.getUserInfo()==null;}
    private void extract(){
        if(extracting)return;
        if(loading){status.setText("页面仍在加载，请稍后提取");return;}
        if(script==null||web.getUrl()==null||!allowed(Uri.parse(web.getUrl()))){status.setText("请先打开 HTTPS 教务课表页面");return;}
        extracting=true;extract.setEnabled(false);extract.setText("读取中");status.setText("正在读取课程与周次…");
        int request=++generation;
        handler.postDelayed(()->{if(extracting&&request==generation){generation++;resetExtract();status.setText("课表读取超时，请等待页面加载完成后重试");}},12000);
        web.evaluateJavascript(script,result->{
            if(request!=generation||isFinishing())return;resetExtract();
            try{
                JSONObject data=new JSONObject(String.valueOf(new JSONTokener(result).nextValue()));
                JSONObject diagnostic=data.optJSONObject("diagnostics");String code=diagnostic==null?"no_table":diagnostic.optString("status");
                if("found".equals(code)){
                    if(data.toString().length()>400000){status.setText("课表页面过大，请改用文件导入");return;}
                    Intent answer=new Intent();answer.putExtra("payload",data.toString());setResult(RESULT_OK,answer);finish();return;
                }
                String message=switch(code){
                    case "login"->"登录尚未完成或已过期，请登录后进入完整学期课表";
                    case "loading"->"课表还在加载，请稍后重试";
                    case "frame_blocked"->"课表位于无法直接读取的嵌套页面，可打开该页面后重新提取";
                    case "parse_error"->"已读取网页，但课程格式暂未识别。请确认是完整学期课表";
                    default->"未找到课表。请进入学生个人课表，并切换到完整学期视图";
                };
                status.setText(message);
                JSONArray frames=diagnostic==null?null:diagnostic.optJSONArray("frames");
                if(frames!=null&&frames.length()>0)showFrames(frames);
            }catch(Exception error){status.setText("课表读取失败，请刷新教务页面后重试");}
        });
    }
    private void resetExtract(){extracting=false;extract.setText("提取");extract.setEnabled(!loading);}
    private void showFrames(JSONArray frames){
        java.util.ArrayList<String> urls=new java.util.ArrayList<>(),labels=new java.util.ArrayList<>();
        for(int i=0;i<frames.length();i++){JSONObject item=frames.optJSONObject(i);if(item==null)continue;
            Uri uri=Uri.parse(item.optString("url"));if(!allowed(uri))continue;urls.add(uri.toString());labels.add(item.optString("label",uri.getHost())+" · "+uri.getHost());}
        if(urls.isEmpty())return;
        android.app.Dialog dialog=new android.app.Dialog(this);
        LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(dp(20),dp(24),dp(20),dp(16));
        GradientDrawable background=new GradientDrawable();background.setColor(Color.parseColor(dark?"#1b2028":"#eef1f9"));background.setCornerRadius(dp(28));content.setBackground(background);
        TextView heading=new TextView(this);heading.setText("打开嵌套课表页面");heading.setTextSize(20);heading.setTypeface(null,Typeface.BOLD);heading.setTextColor(Color.parseColor(dark?"#e3e5ec":"#191c20"));heading.setPadding(dp(4),0,dp(4),dp(18));content.addView(heading);
        ScrollView scroll=new ScrollView(this);LinearLayout options=new LinearLayout(this);options.setOrientation(LinearLayout.VERTICAL);scroll.addView(options);
        for(int i=0;i<urls.size();i++){final int which=i;Button option=pill(labels.get(i),false);option.setMaxLines(2);option.setEllipsize(android.text.TextUtils.TruncateAt.END);option.setGravity(android.view.Gravity.CENTER_VERTICAL|android.view.Gravity.START);option.setPadding(dp(16),dp(8),dp(16),dp(8));option.setOnClickListener(v->{dialog.dismiss();web.loadUrl(urls.get(which));});LinearLayout.LayoutParams row=new LinearLayout.LayoutParams(-1,dp(60));row.bottomMargin=dp(8);options.addView(option,row);}
        content.addView(scroll,new LinearLayout.LayoutParams(-1,Math.min(dp(260),urls.size()*dp(68))));
        Button cancel=pill("留在当前页面",false);cancel.setOnClickListener(v->dialog.dismiss());content.addView(cancel,new LinearLayout.LayoutParams(-1,dp(48)));
        dialog.setContentView(content);dialog.show();
        if(dialog.getWindow()!=null){dialog.getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.TRANSPARENT));dialog.getWindow().setLayout(Math.min(getResources().getDisplayMetrics().widthPixels-dp(40),dp(400)),-2);}
    }
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){generation++;handler.removeCallbacksAndMessages(null);if(web!=null){web.destroy();web=null;}CookieManager.getInstance().removeAllCookies(null);super.onDestroy();}
}
