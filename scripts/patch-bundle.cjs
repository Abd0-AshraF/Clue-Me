const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, '../public/assets/index-discord-v30.js');
let code = fs.readFileSync(bundlePath, 'utf8');

console.log('Running robust client bundle patcher...');

// Helper to do search & replace with logging
function safeReplace(name, target, replacement) {
  if (code.includes(target)) {
    code = code.replace(target, replacement);
    console.log(`✅ ${name}: Patched successfully.`);
    return true;
  } else if (code.includes(replacement.slice(0, 100))) {
    console.log(`ℹ️ ${name}: Already patched.`);
    return true;
  } else {
    console.warn(`⚠️ ${name}: Target not found in bundle. Skipping.`);
    return false;
  }
}

// 1. Update J_ function to accept optional exchange code (if not already done)
const oldJ_ = 'function J_(){try{const n=await Ds("/api/auth/discord/exchange",{method:"POST"});return Nr(n.token),{user:n.user,linked:n.linked}}catch(n){return n instanceof tc&&n.code,null}}';
const newJ_ = 'function J_(code){try{const n=await Ds("/api/auth/discord/exchange",{method:"POST",body:JSON.stringify(code?{code}:{})});return Nr(n.token),{user:n.user,linked:n.linked}}catch(n){return n instanceof tc&&n.code,null}}';
safeReplace('J_ function signature', oldJ_, newJ_);

// 2. Cleanly replace AuthProvider (i2) (if not already done)
// We check if we already have the custom appUrlOpen listener inside i2
if (!code.includes('window.Capacitor?.Plugins?.App')) {
  const i2Start = code.indexOf('function i2({children:n}){');
  const i2End = code.indexOf('function xa(){');
  if (i2Start !== -1 && i2End !== -1) {
    const newI2 = `function i2({children:n}){const[r,s]=T.useState(null),[i,l]=T.useState("loading"),[f,p]=T.useState(()=>Du()),[m,h]=T.useState(!0),[g,v]=T.useState(null);T.useEffect(()=>{let Y=!1;return q0().then(te=>{Y||(s(te.user),l(te.status),p(Du()),h(!1))}),()=>{Y=!0}},[]);T.useEffect(()=>{const handleMsg=(e)=>{if(e.data?.type==="DISCORD_AUTH_SUCCESS"&&e.data?.payload?.user){const ge=e.data.payload;s(ge.user);l("authenticated");Cu(ge.user.name);h(!1);v(ge.linked?{kind:"linked"}:{kind:"login",name:ge.user.name});}};window.addEventListener("message",handleMsg);return ()=>window.removeEventListener("message",handleMsg);},[]);T.useEffect(()=>{const Y=new URLSearchParams(window.location.search);if(Y.get("auth")!=="discord")return;const discordCode=Y.get("code");const te=Y.get("error");const le=new URL(window.location.href);le.searchParams.delete("auth");le.searchParams.delete("code");le.searchParams.delete("error");window.history.replaceState(null,"",\`\${le.pathname}\${le.search}\${le.hash}\`);if(te){v({kind:"error",code:te==="denied"||te==="state"||te==="conflict"||te==="disabled"?te:"failed"});return;}J_(discordCode).then(ge=>{if(!ge){v({kind:"error",code:"failed"});return;}s(ge.user);l("authenticated");Cu(ge.user.name);h(!1);v(ge.linked?{kind:"linked"}:{kind:"login",name:ge.user.name});if(window.opener){try{window.opener.postMessage({type:"DISCORD_AUTH_SUCCESS",payload:ge},"*")}catch(e){}setTimeout(()=>window.close(),500);}});},[]);T.useEffect(()=>{if(typeof window!=="undefined"&&window.Capacitor?.Plugins?.App){const appPlugin=window.Capacitor.Plugins.App;const handleUrl=(data)=>{if(!data?.url)return;try{const parsed=new URL(data.url);let roomCode=parsed.searchParams.get("room")||parsed.searchParams.get("code");if(!roomCode){const parts=parsed.pathname.split("/").filter(Boolean);if(parts.length>=2&&parts[0]==="room")roomCode=parts[1];}if(roomCode&&/^[A-Za-z]{4}$/i.test(roomCode.trim())){Sn(\`/room/\${roomCode.trim().toUpperCase()}\`);return;}if(parsed.searchParams.get("auth")==="discord"&&parsed.searchParams.get("code")){const c=parsed.searchParams.get("code");J_(c).then(ge=>{if(ge?.user){s(ge.user);l("authenticated");Cu(ge.user.name);h(!1);v(ge.linked?{kind:"linked"}:{kind:"login",name:ge.user.name});}});}}catch(e){}};appPlugin.addListener("appUrlOpen",handleUrl);appPlugin.getLaunchUrl?.().then(res=>{if(res?.url)handleUrl(res);});}},[]);const k=T.useCallback(async(Y,te)=>{const le=await X_({email:Y,password:te});return s(le),l("authenticated"),Cu(le.name),le},[]),E=T.useCallback(async(Y,te,le)=>{const ge=await K_({name:Y,email:te,password:le});return s(ge),l("authenticated"),Cu(ge.name),ge},[]),I=T.useCallback(async()=>{await P_(),s(null),l("guest"),p(Du())},[]),U=T.useCallback(async()=>{const Y=await q0();s(Y.user),l(Y.status)},[]),j=T.useCallback(()=>v(null),[]),H=T.useMemo(()=>({user:r,status:i,guest:f,loading:m,login:k,register:E,logout:I,refresh:U,discordNotice:g,clearDiscordNotice:j}),[r,i,f,m,k,E,I,U,g,j]);return u.jsx(z1.Provider,{value:H,children:n});}`;
    code = code.slice(0, i2Start) + newI2 + '\n' + code.slice(i2End);
    console.log('✅ AuthProvider (i2) replaced successfully.');
  }
} else {
  console.log('ℹ️ AuthProvider (i2) already custom patched.');
}

// 3. Define and/or update SetupWizardModal component
// We want to replace SetupWizardModal if it exists, or insert it.
const setupWizardCode = `
function SetupWizardModal({open:n,onClose:r}){
  const{lang:a,setLang:s}=Ve(),{preference:c,setPreference:u2}=Cs(),{user:p}=xa(),{play:f}=Xt();
  const[step,setStep]=T.useState(1);
  const[name,setName]=T.useState(()=>localStorage.getItem("clue-me:name")||"");
  if(!n)return null;
  const handleFinish=()=>{
    try{localStorage.setItem("clue-me:setup-completed","true");}catch(e){}
    if(name.trim())Cu(name.trim());
    r();
  };
  const themes=[
    {id:"mot",nameAr:"الموط والغموض 🕵️‍♂️",nameEn:"Mystery Mot 🕵️‍♂️",color:"from-red-900 to-zinc-900 border-red-500",descAr:"ثيم التحقيق الجنائي والغموض",descEn:"Crime & mystery detective style"},
    {id:"dark",nameAr:"الليل والهدوء 🌙",nameEn:"Midnight Dark 🌙",color:"from-slate-900 to-indigo-950 border-indigo-500",descAr:"ثيم داكن ومريح للعين",descEn:"Sleek eye-friendly dark theme"},
    {id:"light",nameAr:"النهار المشرق ☀️",nameEn:"Daylight ☀️",color:"from-amber-100 to-orange-50 border-amber-400 text-slate-900",descAr:"ثيم ناصع وعصري",descEn:"Bright clean daylight theme"},
    {id:"mani",nameAr:"ماني ريترو 🎮",nameEn:"Mani Retro 🎮",color:"from-fuchsia-900 to-purple-950 border-fuchsia-500",descAr:"ثيم النيون والكلاسيك",descEn:"Cyberpunk neon arcade style"},
    {id:"mani-dark",nameAr:"ماني داكن 🟣",nameEn:"Mani Dark 🟣",color:"from-violet-950 to-zinc-950 border-violet-500",descAr:"ثيم البنفسجي العميق",descEn:"Deep violet dark style"}
  ];
  return u.jsx(ci,{
    open:n,onClose:r,title:a==="ar"?"✨ معالج الإعداد التفاعلي":"✨ Interactive Setup Wizard",
    children:u.jsxs("div",{
      className:"flex flex-col gap-5 p-1 transition-all duration-300",
      children:[
        u.jsxs("div",{
          className:"flex items-center justify-between border-b border-border/60 pb-3",
          children:[1,2,3,4].map(st=>u.jsxs("div",{
            className:"flex items-center gap-1.5",
            children:[
              u.jsx("button",{
                type:"button",
                onClick:()=>{f?.("click");setStep(st);},
                className:\`flex h-8 w-8 items-center justify-center rounded-full font-bold text-xs transition-all duration-300 \${
                  step===st?"bg-red-brand text-white ring-4 ring-red-brand/20 scale-110 shadow-lg":
                  step>st?"bg-green-600 text-white":"bg-surface-soft text-ink-soft border border-border"
                }\`,
                children:step>st?"✓":st
              }),
              st<4?u.jsx("div",{className:\`h-1 w-5 sm:w-8 rounded-full transition-all duration-300 \${step>st?"bg-green-600":"bg-surface-soft"}\`}):null
            ]
          },st))
        }),
        step===1?u.jsxs("div",{
          className:"flex flex-col gap-4 animate-fadeIn",
          children:[
            u.jsxs("div",{className:"text-center",children:[
              u.jsx("h3",{className:"text-lg font-bold text-ink",children:a==="ar"?"اختر لغتك المفضلة 🌍":"Choose Your Language 🌍"}),
              u.jsx("p",{className:"text-xs text-ink-soft mt-1",children:a==="ar"?"يمكنك تغيير اللغة في أي وقت من الإعدادات":"You can change language anytime in settings"})
            ]}),
            u.jsxs("div",{className:"grid grid-cols-2 gap-3 mt-2",children:[
              u.jsxs("button",{
                type:"button",onClick:()=>{f?.("click");s("ar");},
                className:\`flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border-2 transition-all duration-200 active:scale-95 \${
                  a==="ar"?"border-red-brand bg-red-pale/30 shadow-md ring-2 ring-red-brand/20 scale-105":"border-border bg-surface hover:border-border-strong"
                }\`,
                children:[
                  u.jsx("span",{className:"text-3xl",children:"🇸🇦"}),
                  u.jsxs("div",{className:"text-center",children:[
                    u.jsx("span",{className:"block text-base font-bold text-ink",children:"العربية"}),
                    u.jsx("span",{className:"text-xs text-ink-soft",children:"Arabic"})
                  ]})
                ]
              }),
              u.jsxs("button",{
                type:"button",onClick:()=>{f?.("click");s("en");},
                className:\`flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border-2 transition-all duration-200 active:scale-95 \${
                  a==="en"?"border-red-brand bg-red-pale/30 shadow-md ring-2 ring-red-brand/20 scale-105":"border-border bg-surface hover:border-border-strong"
                }\`,
                children:[
                  u.jsx("span",{className:"text-3xl",children:"🇬🇧"}),
                  u.jsxs("div",{className:"text-center",children:[
                    u.jsx("span",{className:"block text-base font-bold text-ink",children:"English"}),
                    u.jsx("span",{className:"text-xs text-ink-soft",children:"الإنجليزية"})
                  ]})
                ]
              })
            ]})
          ]
        }):null,
        step===2?u.jsxs("div",{
          className:"flex flex-col gap-4 animate-fadeIn",
          children:[
            u.jsxs("div",{className:"text-center",children:[
              u.jsx("h3",{className:"text-lg font-bold text-ink",children:a==="ar"?"اختر مظهر التطبيق (الثيم) 🎨":"Select App Theme 🎨"}),
              u.jsx("p",{className:"text-xs text-ink-soft mt-1",children:a==="ar"?"يتغير تصميم التطبيق وألوانه فورًا حسب اختيارك":"App styling changes live as you choose"})
            ]}),
            u.jsx("div",{
              className:"grid grid-cols-1 gap-2.5 max-h-64 overflow-y-auto p-1",
              children:themes.map(t=>u.jsxs("button",{
                type:"button",key:t.id,onClick:()=>{f?.("click");u2(t.id);},
                className:\`flex items-center justify-between gap-3 p-3.5 rounded-xl border-2 text-start transition-all duration-200 active:scale-95 \${
                  c===t.id?"border-red-brand bg-surface shadow-md ring-2 ring-red-brand/20 scale-[1.01]":"border-border bg-surface hover:border-border-strong"
                }\`,
                children:[
                  u.jsxs("div",{className:"flex items-center gap-2.5",children:[
                    u.jsx("div",{className:\`h-6 w-6 rounded-full bg-gradient-to-br \${t.color} border shadow-sm\`}),
                    u.jsxs("div",{children:[
                      u.jsx("p",{className:"text-sm font-bold text-ink",children:a==="ar"?t.nameAr:t.nameEn}),
                      u.jsx("p",{className:"text-[11px] text-ink-soft",children:a==="ar"?t.descAr:t.descEn})
                    ]})
                  ]}),
                  c===t.id?u.jsx("span",{className:"h-2.5 w-2.5 rounded-full bg-red-brand ring-4 ring-red-brand/30 animate-pulse"}) : null
                ]
              }))
            })
          ]
        }):null,
        step===3?u.jsxs("div",{
          className:"flex flex-col gap-4 animate-fadeIn",
          children:[
            u.jsxs("div",{className:"text-center",children:[
              u.jsx("h3",{className:"text-lg font-bold text-ink",children:a==="ar"?"الهوية وتسجيل الدخول 👤":"Identity & Sign-In 👤"}),
              u.jsx("p",{className:"text-xs text-ink-soft mt-1",children:a==="ar"?"سجل بالديسكورد للربط السريع أو استخدم اسمًا مستعارًا":"Sign in with Discord or set a guest nickname"})
            ]}),
            p?u.jsxs("div",{
              className:"flex items-center justify-between gap-3 rounded-2xl border border-green-500/40 bg-green-500/10 p-4",
              children:[
                u.jsxs("div",{className:"flex items-center gap-3",children:[
                  p.avatar?u.jsx("img",{src:p.avatar,alt:p.name,className:"h-12 w-12 rounded-full border-2 border-green-500 shadow-md"}):u.jsx("div",{className:"flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 font-bold text-white text-lg",children:p.name?.charAt(0)||"D"}),
                  u.jsxs("div",{children:[
                    u.jsx("p",{className:"font-bold text-ink text-base",children:p.name}),
                    u.jsx("p",{className:"text-xs text-green-600 font-medium",children:a==="ar"?"✓ مسجل ومقترن بالديسكورد":"✓ Linked with Discord"})
                  ]})
                ]}),
                u.jsx("span",{className:"rounded-full bg-green-500/20 px-3 py-1 text-xs font-bold text-green-600",children:"Active"})
              ]
            }):u.jsxs("div",{
              className:"flex flex-col gap-3 rounded-2xl border border-border bg-surface-soft/60 p-4",
              children:[
                u.jsxs("button",{
                  type:"button",
                  onClick:()=>{
                    const isCap=typeof window!=="undefined"&&window.Capacitor;
                    const ie=isCap?"clueme://auth/discord":encodeURIComponent(\`\${window.location.pathname}\${window.location.search}\`);
                    const targetServer=window.__CLUE_ME_SERVER_URL__||"https://clue-me.ai.studio";
                    const authUrl=\`\${targetServer}/api/auth/discord?returnTo=\${ie}\`;
                    if(isCap){
                      window.open(authUrl,"_system");
                      return;
                    }
                    const popup=window.open(authUrl,"discord_auth","width=600,height=700,status=no,menubar=no,toolbar=no");
                    if(!popup||popup.closed)window.location.href=authUrl;
                  },
                  className:"flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-[#5865F2] font-bold text-white shadow-md transition-all hover:bg-[#4752C4] active:scale-95",
                  children:[
                    u.jsx("svg",{className:"h-5 w-5 fill-current",viewBox:"0 0 127.14 96.36",children:u.jsx("path",{d:"M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,0,104.87,104.87,0,0,0,22.75,8.07,108.6,108.6,0,0,0,.7,72.8a105.2,105.2,0,0,0,32.22,16.29,77.7,77.7,0,0,0,6.89-11.11,68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a73.2,73.2,0,0,0,64.08,0c.87.68,1.76,1.36,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1,105.25,105.25,0,0,0,32.23-16.29A108.38,108.38,0,0,0,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.88,53,48.83,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.11,53,91.08,65.69,84.69,65.69Z"})}),
                    a==="ar"?"تسجيل الدخول بواسطة ديسكورد":"Sign in with Discord"
                  ]
                }),
                u.jsx("div",{className:"relative my-1 text-center",children:u.jsx("span",{className:"bg-surface px-2 text-[11px] font-bold text-ink-soft",children:a==="ar"?"أو أدخل اسمك للعب كزائر":"OR enter your guest display name"})}),
                u.jsx(za,{
                  label:a==="ar"?"اسمك المستعار":"Display Name",
                  placeholder:"لاعب 1",
                  value:name,
                  onChange:e=>setName(e.target.value)
                })
              ]
            })
          ]
        }):null,
        step===4?u.jsxs("div",{
          className:"flex flex-col items-center gap-4 text-center animate-fadeIn py-2",
          children:[
            u.jsx("div",{className:"flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 text-green-500 text-3xl shadow-lg ring-8 ring-green-500/10 animate-bounce",children:"🎉"}),
            u.jsxs("div",{children:[
              u.jsx("h3",{className:"text-xl font-extrabold text-ink",children:a==="ar"?"أنت جاهز تمامًا للبدء! 🚀":"You're All Set! 🚀"}),
              u.jsx("p",{className:"text-xs text-ink-soft mt-1",children:a==="ar"?"تم حفظ إعدادات اللغة والمظهر والملف الشخصي بنجاح":"Preferences saved successfully"})
            ]}),
            u.jsxs("div",{
              className:"w-full rounded-2xl border border-border bg-surface p-3.5 flex flex-col gap-2 text-xs font-bold text-ink-soft",
              children:[
                u.jsxs("div",{className:"flex justify-between",children:[u.jsx("span",{children:a==="ar"?"اللغة:":"Language:"}),u.jsx("span",{className:"text-ink",children:a==="ar"?"العربية 🇸🇦":"English 🇬🇧"})]}),
                u.jsxs("div",{className:"flex justify-between",children:[u.jsx("span",{children:a==="ar"?"المظهر:":"Theme:"}),u.jsx("span",{className:"text-ink uppercase",children:c})]}),
                u.jsxs("div",{className:"flex justify-between",children:[u.jsx("span",{children:a==="ar"?"اللاعب:":"Player:"}),u.jsx("span",{className:"text-ink",children:p?.name||name||"زائر"})]})
              ]
            }),
            u.jsx("button",{
              type:"button",onClick:handleFinish,
              className:"mt-2 h-12 w-full rounded-2xl bg-red-brand font-bold text-white shadow-xl hover:bg-red-brand/90 transition-all duration-200 active:scale-95 text-base flex items-center justify-center gap-2",
              children:a==="ar"?"ابدأ اللعب الآن 🚀":"Start Playing Now 🚀"
            })
          ]
        }):null,
        step<4?u.jsxs("div",{
          className:"flex items-center justify-between border-t border-border/60 pt-3 mt-2",
          children:[
            step>1?u.jsx("button",{
              type:"button",onClick:()=>{f?.("click");setStep(s=>s-1);},
              className:"px-4 py-2 rounded-xl border border-border bg-surface text-xs font-bold text-ink hover:bg-surface-soft active:scale-95 transition-all",
              children:a==="ar"?"السابق":"Back"
            }):u.jsx("button",{
              type:"button",onClick:r,
              className:"px-4 py-2 rounded-xl text-xs font-medium text-ink-soft hover:text-ink transition-all",
              children:a==="ar"?"تخطي":"Skip"
            }),
            u.jsx("button",{
              type:"button",onClick:()=>{f?.("click");setStep(s=>s+1);},
              className:"px-5 py-2 rounded-xl bg-red-brand text-xs font-bold text-white shadow-md hover:bg-red-brand/90 active:scale-95 transition-all flex items-center gap-1.5",
              children:a==="ar"?"التالي ➔":"Next ➔"
            })
          ]
        }):null
      ]
    })
  });
}
`;

// Replace SetupWizardModal if already defined
if (code.includes('function SetupWizardModal(')) {
  const wizardStart = code.indexOf('function SetupWizardModal({');
  const wizardEnd = code.indexOf('function QA({');
  if (wizardStart !== -1 && wizardEnd !== -1) {
    code = code.slice(0, wizardStart) + setupWizardCode + '\n' + code.slice(wizardEnd);
    console.log('✅ SetupWizardModal updated successfully in bundle.');
  }
} else {
  // Otherwise, insert it before QA component
  const qaPos = code.indexOf('function QA({');
  if (qaPos !== -1) {
    code = code.slice(0, qaPos) + setupWizardCode + '\n' + code.slice(qaPos);
    console.log('✅ SetupWizardModal defined and inserted.');
  }
}

// 4. Update QA Modal to include Setup Wizard button & Admin button (if not already done)
if (!code.includes('معالج الإعداد التفاعلي')) {
  const newQA = `function QA({open:n,onClose:r,onOpenAdmin:a,onOpenSetup:st}){const{t:l}=Ve(),{settings:m,updateSettings:h}=G1(),g=o2();return u.jsx(qk,{open:n,onClose:r,title:l.settings.title,children:u.jsxs("div",{className:"flex flex-col gap-5",children:[u.jsxs("div",{className:"rounded-xl border border-border bg-surface-soft/60 p-4",children:[u.jsxs("div",{className:"flex items-center justify-between gap-3",children:[u.jsxs("span",{className:"inline-flex items-center gap-2 text-sm font-bold text-ink",children:[u.jsx(X1,{size:16,className:"text-red-brand","aria-hidden":"true"}),l.settings.sound]}),u.jsx(k1,{checked:!m.muted,ariaLabel:l.settings.mute,onChange:v=>{h({muted:!v}),v&&g("click")}})]}),u.jsxs("div",{className:"mt-4 flex flex-col gap-4",children:[u.jsx(Yh,{label:l.settings.masterVolume,value:m.master,onChange:v=>h({master:v})}),u.jsx(Yh,{label:l.settings.uiVolume,value:m.ui,onChange:v=>h({ui:v})}),u.jsx(Yh,{label:l.settings.gameVolume,value:m.game,onChange:v=>h({game:v})}),u.jsxs("div",{className:"flex items-center justify-between gap-3",children:[u.jsx("span",{className:"text-sm font-medium text-ink-soft",children:l.settings.haptics}),u.jsx(k1,{checked:m.haptics,ariaLabel:l.settings.haptics,onChange:v=>{h({haptics:v}),v&&g("click")}})]})]}),u.jsxs("div",{className:"flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 mt-3",children:[u.jsxs("span",{className:"inline-flex items-center gap-2 text-sm font-bold text-ink",children:[u.jsx(P1,{size:16,className:"text-amber-500","aria-hidden":"true"}),"معالج الإعداد التفاعلي"]}),u.jsx("button",{type:"button",onClick:()=>{r();if(typeof st==="function")st();},className:"inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-500 bg-amber-500 px-3 text-xs font-bold text-white shadow-sm transition-all hover:bg-amber-600 active:scale-95",children:"فتح الإعداد"})]}),u.jsxs("div",{className:"flex items-center justify-between gap-3 rounded-xl border border-red-pale bg-red-pale/20 p-3.5 mt-3",children:[u.jsxs("span",{className:"inline-flex items-center gap-2 text-sm font-bold text-ink",children:[u.jsx(ya,{size:16,className:"text-red-brand","aria-hidden":"true"}),l.admin?.title||"لوحة الإدارة"]}),u.jsx("button",{type:"button",onClick:()=>{r();if(typeof a==="function")a();else Sn("/admin")},className:"inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-brand bg-red-brand px-3 text-xs font-bold text-white shadow-sm transition-all hover:bg-red-brand/90 active:scale-95",children:l.admin?.title||"فتح الإدارة"})]})]}),u.jsxs("div",{className:"rounded-xl border border-border bg-surface-soft/60 p-4",children:[u.jsx("span",{className:"text-sm font-bold text-ink",children:l.settings.theme}),u.jsxs("div",{className:"mt-3 grid grid-cols-2 gap-2",children:[u.jsx(y1,{value:"light",label:l.settings.themeLight,icon:cl}),u.jsx(y1,{value:"dark",label:l.settings.themeDark,icon:fl})]})]})]})})} `;
  const qaStart = code.indexOf('function QA({');
  const qaEnd = code.indexOf('function JA({team:n}){');
  if (qaStart !== -1 && qaEnd !== -1) {
    code = code.slice(0, qaStart) + newQA + '\n' + code.slice(qaEnd);
    console.log('✅ QA Modal patched successfully.');
  }
} else {
  console.log('ℹ️ QA Modal already patched.');
}

// 5. Update HomePage (vk) to render SetupWizardModal (if not already done)
if (!code.includes('u.jsx(SetupWizardModal')) {
  const oldVkStart = code.indexOf('function vk({');
  const oldVkEnd = code.indexOf('function bk({');
  if (oldVkStart !== -1 && oldVkEnd !== -1) {
    const newVk = `function vk({onPlay:n,onRoom:r,onOpenAdmin:s,dialog:i=null,onCloseDialog:l}){const{t:f}=Ve(),[p,m]=T.useState(!1),[h,g]=T.useState(i==="create"),[v,k]=T.useState(i==="join"),[E,I]=T.useState(i==="login"),[U,j]=T.useState(!1),[H,Y]=T.useState(""),[te,le]=T.useState([]);const[setupOpen,setSetupOpen]=T.useState(()=>typeof window!=="undefined"&&!localStorage.getItem("clue-me:setup-completed"));T.useEffect(()=>{g(i==="create"),k(i==="join"),I(i==="login")},[i]),T.useEffect(()=>{const ve=(new URLSearchParams(window.location.search).get("room")??"").toUpperCase();/^[A-Z]{4}$/.test(ve)&&Sn(Sr(ve),{replace:!0})},[]);const ge=ve=>()=>{ve(!1),i&&l?.()};return T.useEffect(()=>{le(Xv())},[]),u.jsxs("div",{className:"flex min-h-dvh flex-col",children:[u.jsx(tk,{onOpenAuth:()=>I(!0),onOpenProfile:()=>j(!0),onOpenAdmin:s,onOpenSetup:()=>setSetupOpen(!0)}),u.jsxs("main",{className:"flex-1",children:[u.jsx(lk,{onHowToPlay:()=>m(!0),onPlay:n,onCreateRoom:()=>g(!0),onJoinRoom:()=>{Y(""),k(!0)}}),te.length>0?u.jsxs("section",{className:"mx-auto max-w-6xl px-4 pb-14",children:[u.jsx("p",{className:"text-center text-xs font-bold uppercase tracking-wide text-ink-faint",children:f.share.recent}),u.jsx("div",{className:"mt-3 flex flex-wrap items-center justify-center gap-2",children:te.map(ve=>u.jsxs("button",{type:"button",onClick:()=>Sn(Sr(ve.code)),className:"inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-bold text-ink shadow-card transition-all duration-150 hover:border-border-strong hover:shadow-lift active:scale-[0.97]",title:ve.name,children:[u.jsx("span",{dir:"ltr",className:"tracking-[0.2em] text-red-brand",children:ve.code}),u.jsx("span",{className:"max-w-28 truncate text-xs font-medium text-ink-soft",dir:"auto",children:ve.name})]},ve.code))})]}):null,u.jsx(uk,{})]}),u.jsx(ek,{}),u.jsx(ck,{open:p,onClose:()=>m(!1)}),u.jsx(Bw,{open:E,onClose:ge(I)}),u.jsx($w,{open:U,onClose:()=>j(!1)}),u.jsx(dk,{open:h,onClose:ge(g),onCreated:(ve,ie)=>{g(!1),r(ve,ie)}}),u.jsx(fk,{open:v,initialCode:H,onClose:ge(k),onJoined:(ve,ie)=>{k(!1),r(ve,ie)}}),u.jsx(SetupWizardModal,{open:setupOpen,onClose:()=>setSetupOpen(!1)})]})} `;
    code = code.slice(0, oldVkStart) + newVk + '\n' + code.slice(oldVkEnd);
    console.log('✅ HomePage (vk) updated to render SetupWizardModal.');
  }
} else {
  console.log('ℹ️ HomePage (vk) already configured with SetupWizardModal.');
}

// 6. Update Header (tk) to pass onOpenSetup to QA (if not already done)
if (!code.includes('onOpenSetup:st')) {
  const tkHeaderOld = 'function tk({onOpenAuth:n,onOpenProfile:r,onOpenAdmin:s}){';
  const tkHeaderNew = 'function tk({onOpenAuth:n,onOpenProfile:r,onOpenAdmin:s,onOpenSetup:st}){';
  const tkQaOld = 'settingsOpen?u.jsx(QA,{open:settingsOpen,onClose:()=>setSettingsOpen(!1),onOpenAdmin:s}):null';
  const tkQaNew = 'settingsOpen?u.jsx(QA,{open:settingsOpen,onClose:()=>setSettingsOpen(!1),onOpenAdmin:s,onOpenSetup:st}):null';
  
  if (code.includes(tkHeaderOld)) code = code.replace(tkHeaderOld, tkHeaderNew);
  if (code.includes(tkQaOld)) code = code.replace(tkQaOld, tkQaNew);
  console.log('✅ Header (tk) updated with onOpenSetup.');
} else {
  console.log('ℹ️ Header (tk) already configured.');
}

// 7. Patch Bw (Login Modal) to prevent variable shadowing and handle Capacitor safely
const oldBwGe = 'const ge=()=>{const ie=encodeURIComponent(`${window.location.pathname}${window.location.search}`);const targetServer=window.__CLUE_ME_SERVER_URL__||"https://clue-me.ai.studio";const authUrl=`${targetServer}/api/auth/discord?returnTo=${ie}`;const popup=window.open(authUrl,"discord_auth","width=600,height=700,status=no,menubar=no,toolbar=no");if(popup&&!popup.closed){const timer=setInterval(async()=>{if(popup.closed){clearInterval(timer)}try{const res=await J_();if(res&&res.user){clearInterval(timer);try{popup.close()}catch(e){}s(res.user);l("authenticated");Cu(res.user.name);h(!1);v(res.linked?{kind:"linked"}:{kind:"login",name:res.user.name});r();}}catch(e){}},1200)}else{window.location.href=authUrl;}};';

const newBwGe = 'const ge=()=>{const isCap=typeof window!=="undefined"&&window.Capacitor;const ie=isCap?"clueme://auth/discord":encodeURIComponent(`${window.location.pathname}${window.location.search}`);const targetServer=window.__CLUE_ME_SERVER_URL__||"https://clue-me.ai.studio";const authUrl=`${targetServer}/api/auth/discord?returnTo=${ie}`;if(isCap){window.open(authUrl,"_system");r();return;}const popup=window.open(authUrl,"discord_auth","width=600,height=700,status=no,menubar=no,toolbar=no");if(popup&&!popup.closed){const timer=setInterval(async()=>{if(popup.closed){clearInterval(timer)}try{const res=await J_();if(res&&res.user){clearInterval(timer);try{popup.close()}catch(ex){}const{refresh:refreshAuth}=xa();await refreshAuth();r();}}catch(ex){}},1200)}else{window.location.href=authUrl;}};';

safeReplace('Bw login helper (prevent shadowing & crash)', oldBwGe, newBwGe);

// 8. Wrap Admin Panel tabs with a fully mobile responsive container
// Find either the previously patched main element or the original one, and wrap it
const unpatchedMain = 'u.jsxs("main",{className:"mx-auto w-full max-w-4xl flex-1 px-3 py-5",children:[u.jsx(Ms,{value:s,ariaLabel:r.admin.title,onChange:i,className:"mb-4 w-full justify-center",options:[{value:"reports",label:r.admin.tabReports},{value:"users",label:r.admin.tabUsers},{value:"words",label:r.admin.tabWords},{value:"audit",label:r.admin.tabAudit}]}),s==="reports"?u.jsx(nj,{}):null,s==="users"?u.jsx(aj,{}):null,s==="words"?u.jsx(ij,{}):null,s==="audit"?u.jsx(sj,{}):null]})';

const partiallyPatchedMain = 'u.jsxs("main",{className:"mx-auto w-full max-w-4xl flex-1 px-3 py-5",children:[u.jsx(Ms,{value:s,ariaLabel:r.admin.title,onChange:i,className:"mb-4 w-full justify-start sm:justify-center overflow-x-auto max-w-full font-bold px-1 py-1",options:[{value:"reports",label:r.admin.tabReports},{value:"users",label:r.admin.tabUsers},{value:"words",label:r.admin.tabWords},{value:"audit",label:r.admin.tabAudit}]}),s==="reports"?u.jsx(nj,{}):null,s==="users"?u.jsx(aj,{}):null,s==="words"?u.jsx(ij,{}):null,s==="audit"?u.jsx(sj,{}):null]})';

const fullyResponsiveMain = 'u.jsxs("main",{className:"mx-auto w-full max-w-4xl flex-1 px-3 py-5 overflow-hidden",children:[u.jsx("div",{className:"w-full overflow-x-auto pb-2 mb-4 scrollbar-thin",children:u.jsx(Ms,{value:s,ariaLabel:r.admin.title,onChange:i,className:"min-w-max",options:[{value:"reports",label:r.admin.tabReports},{value:"users",label:r.admin.tabUsers},{value:"words",label:r.admin.tabWords},{value:"audit",label:r.admin.tabAudit}]})}),s==="reports"?u.jsx(nj,{}):null,s==="users"?u.jsx(aj,{}):null,s==="words"?u.jsx(ij,{}):null,s==="audit"?u.jsx(sj,{}):null]})';

if (code.includes(partiallyPatchedMain)) {
  code = code.replace(partiallyPatchedMain, fullyResponsiveMain);
  console.log('✅ Wrapped Admin panel tabs with responsive horizontal scrolling (from partially patched main).');
} else if (code.includes(unpatchedMain)) {
  code = code.replace(unpatchedMain, fullyResponsiveMain);
  console.log('✅ Wrapped Admin panel tabs with responsive horizontal scrolling (from unpatched main).');
} else if (code.includes('scrollbar-thin')) {
  console.log('ℹ️ Admin panel tabs already wrapped in responsive horizontal scrolling.');
} else {
  console.warn('⚠️ Could not find target Admin panel main element to wrap!');
}

fs.writeFileSync(bundlePath, code, 'utf8');
console.log('Client bundle patching complete!');
