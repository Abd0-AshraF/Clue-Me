const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, '../public/assets/index-discord-v30.js');
let code = fs.readFileSync(bundlePath, 'utf8');

console.log('Running high-fidelity client bundle patcher...');

// Helper to do search & replace with logging
function safeReplace(name, target, replacement) {
  if (!target || target === "") {
    console.log(`ℹ️ ${name}: Skipping empty target (already patched or not present).`);
    return false;
  }
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

// 1. Update J_ function to accept optional exchange code
const oldJ_ = 'async function J_(){try{const n=await Ds("/api/auth/discord/exchange",{method:"POST"});return Nr(n.token),{user:n.user,linked:n.linked}}catch(n){return n instanceof tc&&n.code,null}}';
const newJ_ = 'async function J_(code){try{const n=await Ds("/api/auth/discord/exchange",{method:"POST",body:JSON.stringify(code?{code}:{})});return Nr(n.token),{user:n.user,linked:n.linked}}catch(n){return n instanceof tc&&n.code,null}}';
safeReplace('J_ function signature', oldBourneCode(oldJ_), newJ_);

function oldBourneCode(str) {
  return code.includes(str) ? str : '';
}

// 2. Cleanly replace AuthProvider (i2) with the super-bulletproof url parser
const i2Start = code.indexOf('function i2({children:n}){');
const i2End = code.indexOf('function xa(){');

if (i2Start !== -1 && i2End !== -1) {
  const newI2 = `function i2({children:n}){const[r,s]=T.useState(null),[i,l]=T.useState("loading"),[f,p]=T.useState(()=>Du()),[m,h]=T.useState(!0),[g,v]=T.useState(null);T.useEffect(()=>{let Y=!1;return q0().then(te=>{Y||(s(te.user),l(te.status),p(Du()),h(!1))}),()=>{Y=!0}},[]);T.useEffect(()=>{const handleMsg=(e)=>{if(e.data?.type==="DISCORD_AUTH_SUCCESS"&&e.data?.payload?.user){const ge=e.data.payload;s(ge.user);l("authenticated");Cu(ge.user.name);h(!1);v(ge.linked?{kind:"linked"}:{kind:"login",name:ge.user.name});}};window.addEventListener("message",handleMsg);return ()=>window.removeEventListener("message",handleMsg);},[]);T.useEffect(()=>{const Y=new URLSearchParams(window.location.search);if(Y.get("auth")!=="discord")return;const discordCode=Y.get("code");const te=Y.get("error");const le=new URL(window.location.href);le.searchParams.delete("auth");le.searchParams.delete("code");le.searchParams.delete("error");window.history.replaceState(null,"",\`\${le.pathname}\${le.search}\${le.hash}\`);if(te){v({kind:"error",code:te==="denied"||te==="state"||te==="conflict"||te==="disabled"?te:"failed"});return;}J_(discordCode).then(ge=>{if(!ge){v({kind:"error",code:"failed"});return;}s(ge.user);l("authenticated");Cu(ge.user.name);h(!1);v(ge.linked?{kind:"linked"}:{kind:"login",name:ge.user.name});if(window.opener){try{window.opener.postMessage({type:"DISCORD_AUTH_SUCCESS",payload:ge},"*")}catch(e){}setTimeout(()=>window.close(),500);}});},[]);T.useEffect(()=>{if(typeof window!=="undefined"&&window.Capacitor?.Plugins?.App){const appPlugin=window.Capacitor.Plugins.App;const handleUrl=(data)=>{if(!data?.url)return;try{const urlStr=data.url;let roomCode=null;const matchParam=urlStr.match(/[?&](room|code)=([A-Za-z]{4})(&|$)/i);if(matchParam){roomCode=matchParam[2];}else{const matchPath=urlStr.match(/\\/room\\/([A-Za-z]{4})(\\/|\\?|$)/i);if(matchPath){roomCode=matchPath[1];}else{const matchSimple=urlStr.match(/:\\/\\/?([A-Za-z]{4})(\\/|\\?|$)/i);if(matchSimple)roomCode=matchSimple[1];}}if(roomCode&&/^[A-Za-z]{4}$/i.test(roomCode.trim())){Sn(\`/room/\${roomCode.trim().toUpperCase()}\`);return;}const parsed=new URL(urlStr);if(parsed.searchParams.get("auth")==="discord"&&parsed.searchParams.get("code")){const c=parsed.searchParams.get("code");J_(c).then(ge=>{if(ge?.user){s(ge.user);l("authenticated");Cu(ge.user.name);h(!1);v(ge.linked?{kind:"linked"}:{kind:"login",name:ge.user.name});}});}}catch(e){}};appPlugin.addListener("appUrlOpen",handleUrl);appPlugin.getLaunchUrl?.().then(res=>{if(res?.url)handleUrl(res);});}},[]);const k=T.useCallback(async(Y,te)=>{const le=await X_({email:Y,password:te});return s(le),l("authenticated"),Cu(le.name),le},[]),E=T.useCallback(async(Y,te,le)=>{const ge=await K_({name:Y,email:te,password:le});return s(ge),l("authenticated"),Cu(ge.name),ge},[]),I=T.useCallback(async()=>{await P_(),s(null),l("guest"),p(Du())},[]),U=T.useCallback(async()=>{const Y=await q0();s(Y.user),l(Y.status)},[]),j=T.useCallback(()=>v(null),[]),H=T.useMemo(()=>({user:r,status:i,guest:f,loading:m,login:k,register:E,logout:I,refresh:U,discordNotice:g,clearDiscordNotice:j}),[r,i,f,m,k,E,I,U,g,j]);return u.jsx(z1.Provider,{value:H,children:n});}`;
  code = code.slice(0, i2Start) + newI2 + '\n' + code.slice(i2End);
  console.log('✅ AuthProvider (i2) replaced successfully with bulletproof deep-linking integration.');
}

// 3. Define SetupWizardModal & ThemeTransitionOverlay
const setupWizardCode = `
function ThemeTransitionOverlay({theme}){
  if(!theme)return null;
  return u.jsxs("div",{
    className:"fixed inset-0 z-[10000] pointer-events-none flex flex-col items-center justify-center overflow-hidden animate-fadeOut",
    style:{animationDuration:"1.4s",animationFillMode:"forwards"},
    children:[
      u.jsx("style",{
        children:\`
          @keyframes fadeOut {
            0% { opacity: 1; }
            75% { opacity: 1; }
            100% { opacity: 0; }
          }
          @keyframes zoomIn {
            0% { transform: scale(0.6); opacity: 0; }
            30% { transform: scale(1.15); opacity: 1; }
            70% { transform: scale(1); opacity: 1; }
            100% { transform: scale(1.4); opacity: 0; }
          }
          @keyframes sun-rotate {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes grid-scroll {
            0% { background-position: 0 0; }
            100% { background-position: 0 40px; }
          }
          @keyframes purple-ripple {
            0% { transform: scale(0.85); opacity: 0.3; }
            50% { transform: scale(1.2); opacity: 0.8; }
            100% { transform: scale(0.85); opacity: 0.3; }
          }
          @keyframes searchlight {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          @keyframes star-twinkle {
            0%, 100% { opacity: 0.2; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1.2); }
          }
          .animate-zoom { animation: zoomIn 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
          .sun-ray {
            background: repeating-conic-gradient(from 0deg, rgba(251,191,36,0.18) 0deg 15deg, transparent 15deg 30deg);
            animation: sun-rotate 20s linear infinite;
          }
          .retro-grid {
            background-size: 40px 40px;
            background-image: linear-gradient(to right, rgba(236,72,153,0.15) 1px, transparent 1px),
                              linear-gradient(to bottom, rgba(236,72,153,0.15) 1px, transparent 1px);
            animation: grid-scroll 1.5s linear infinite;
          }
          .searchlight-bg {
            background: radial-gradient(circle at 50% 50%, rgba(239,68,68,0.25) 0%, transparent 60%);
            background-size: 200% 200%;
            animation: searchlight 4s ease-in-out infinite;
          }
          .star-particle {
            animation: star-twinkle 2s ease-in-out infinite;
          }
        \`
      }),
      theme==="light"?u.jsxs("div",{
        className:"absolute inset-0 bg-gradient-to-br from-amber-400 via-orange-300 to-amber-100 flex flex-col items-center justify-center",
        children:[
          u.jsx("div",{className:"absolute inset-0 sun-ray"}),
          u.jsxs("div",{
            className:"animate-zoom flex flex-col items-center gap-4 z-10",
            children:[
              u.jsx("span",{className:"text-8xl drop-shadow-lg",children:"☀️"}),
              u.jsx("h2",{className:"text-3xl font-black text-amber-950 drop-shadow-md",children:"Daylight / النهار المشرق"})
            ]
          })
        ]
      }):null,
      theme==="dark"?u.jsxs("div",{
        className:"absolute inset-0 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex flex-col items-center justify-center",
        children:[
          u.jsx("div",{className:"absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-transparent to-transparent"}),
          // Twinkling star particles
          u.jsx("div",{className:"absolute inset-0 opacity-40",children:Array.from({length:15}).map((_,i)=>u.jsx("div",{
            className:"absolute star-particle text-white text-[10px]",
            style:{
              top:\`\${Math.random()*100}%\`,
              left:\`\${Math.random()*100}%\`,
              animationDelay:\`\${Math.random()*2}s\`,
              animationDuration:\`\${1+Math.random()*2}s\`
            },
            children:"✦"
          },i))}),
          u.jsxs("div",{
            className:"animate-zoom flex flex-col items-center gap-4 z-10",
            children:[
              u.jsx("span",{className:"text-8xl drop-shadow-[0_0_30px_rgba(129,140,248,0.6)]",children:"🌙"}),
              u.jsx("h2",{className:"text-3xl font-black text-indigo-200 drop-shadow-md",children:"Midnight / الليل والهدوء"})
            ]
          })
        ]
      }):null,
      theme==="mot"?u.jsxs("div",{
        className:"absolute inset-0 bg-gradient-to-br from-zinc-950 via-red-950 to-zinc-900 flex flex-col items-center justify-center",
        children:[
          u.jsx("div",{className:"absolute inset-0 searchlight-bg"}),
          // Crime tape design element at top and bottom
          u.jsx("div",{
            className:"absolute top-0 left-0 right-0 h-4 bg-yellow-500",
            style:{background:"repeating-linear-gradient(-45deg, #eab308, #eab308 10px, #000 10px, #000 20px)"}
          }),
          u.jsx("div",{
            className:"absolute bottom-0 left-0 right-0 h-4 bg-yellow-500",
            style:{background:"repeating-linear-gradient(-45deg, #eab308, #eab308 10px, #000 10px, #000 20px)"}
          }),
          u.jsxs("div",{
            className:"animate-zoom flex flex-col items-center gap-4 z-10",
            children:[
              u.jsx("span",{className:"text-8xl drop-shadow-[0_0_30px_rgba(239,68,68,0.6)]",children:"🕵️‍♂️"}),
              u.jsx("h2",{className:"text-3xl font-black text-red-500 drop-shadow-md",children:"Mystery Mot / الغموض والتحقيق"})
            ]
          })
        ]
      }):null,
      theme==="mani"?u.jsxs("div",{
        className:"absolute inset-0 bg-gradient-to-br from-fuchsia-950 via-purple-950 to-zinc-950 flex flex-col items-center justify-center",
        children:[
          u.jsx("div",{className:"absolute inset-0 retro-grid"}),
          u.jsxs("div",{
            className:"animate-zoom flex flex-col items-center gap-4 z-10",
            children:[
              u.jsx("span",{className:"text-8xl drop-shadow-[0_0_35px_rgba(236,72,153,0.7)]",children:"🎮"}),
              u.jsx("h2",{className:"text-3xl font-black text-fuchsia-400 drop-shadow-md",children:"Mani Retro / ماني ريترو"})
            ]
          })
        ]
      }):null,
      theme==="mani-dark"?u.jsxs("div",{
        className:"absolute inset-0 bg-gradient-to-br from-violet-950 via-zinc-950 to-purple-950 flex flex-col items-center justify-center",
        children:[
          u.jsx("div",{
            className:"absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-violet-500/30 via-transparent to-transparent",
            style:{animation:"purple-ripple 6s ease-in-out infinite"}
          }),
          u.jsxs("div",{
            className:"animate-zoom flex flex-col items-center gap-4 z-10",
            children:[
              u.jsx("span",{className:"text-8xl drop-shadow-[0_0_35px_rgba(168,85,247,0.7)]",children:"🟣"}),
              u.jsx("h2",{className:"text-3xl font-black text-violet-400 drop-shadow-md",children:"Mani Dark / ماني داكن"})
            ]
          })
        ]
      }):null
    ]
  });
}

function SetupWizardModal({open:n,onClose:r}){
  const{lang:a,setLang:s}=Ve(),{preference:c,setPreference:u2}=Cs(),{user:p}=xa(),{play:f}=Xt();
  const[step,setStep]=T.useState(1);
  const[name,setName]=T.useState(()=>localStorage.getItem("clue-me:name")||"");
  
  const[animatingTheme,setAnimatingTheme]=T.useState(null);
  const[animationActive,setAnimationActive]=T.useState(false);
  const isFirstLoad=T.useRef(true);

  T.useEffect(()=>{
    if(isFirstLoad.current){
      isFirstLoad.current=false;
      return;
    }
    setAnimatingTheme(c);
    setAnimationActive(true);
    const timer=setTimeout(()=>setAnimationActive(false),1400);
    return ()=>clearTimeout(timer);
  },[c]);

  if(!n)return null;

  const handleCloseAndMark=()=>{
    try{
      localStorage.setItem("clue-me:setup-completed","true");
    }catch(e){}
    r();
  };

  const handleFinish=()=>{
    try{
      localStorage.setItem("clue-me:setup-completed","true");
    }catch(e){}
    if(name.trim())Cu(name.trim());
    r();
  };

  const themes=[
    {id:"mot",nameAr:"الموت والغموض 🕵️‍♂️",nameEn:"Mystery Mot 🕵️‍♂️",descAr:"ثيم التحقيق الجنائي والغموض",descEn:"Crime & mystery detective style",color:"from-red-900 to-zinc-900 border-red-500"},
    {id:"dark",nameAr:"الليل والهدوء 🌙",nameEn:"Midnight Dark 🌙",descAr:"ثيم داكن ومريح للعين",descEn:"Sleek eye-friendly dark theme",color:"from-slate-900 to-indigo-950 border-indigo-500"},
    {id:"light",nameAr:"النهار المشرق ☀️",nameEn:"Daylight ☀️",descAr:"ثيم ناصع وعصري",descEn:"Bright clean daylight theme",color:"from-amber-100 to-orange-50 border-amber-400 text-slate-900"},
    {id:"mani",nameAr:"ماني ريترو 🎮",nameEn:"Mani Retro 🎮",descAr:"ثيم النيون والكلاسيك",descEn:"Cyberpunk neon arcade style",color:"from-fuchsia-900 to-purple-950 border-fuchsia-500"},
    {id:"mani-dark",nameAr:"ماني داكن 🟣",nameEn:"Mani Dark 🟣",descAr:"ثيم البنفسجي العميق",descEn:"Deep violet dark style",color:"from-violet-950 to-zinc-950 border-violet-500"}
  ];

  const stepsDetails = [
    { labelAr: "اللغة", labelEn: "Language", icon: "🌍" },
    { labelAr: "المظهر", labelEn: "Theme", icon: "🎨" },
    { labelAr: "الهوية", labelEn: "Identity", icon: "👤" },
    { labelAr: "جاهز", labelEn: "Ready", icon: "🚀" }
  ];

  return u.jsxs(u.Fragment,{
    children:[
      u.jsx(ci,{
        open:n,onClose:handleCloseAndMark,title:a==="ar"?"✨ معالج الإعداد التفاعلي الأول للعبة":"✨ Welcome to Clue Me — Game Setup",
        children:u.jsxs("div",{
          className:"flex flex-col gap-5 p-1 transition-all duration-300",
          children:[
            // Organized Interactive Step Timeline
            u.jsxs("div",{
              className:"flex items-center justify-between border-b border-border/40 pb-4 mb-2 select-none relative",
              children:[
                // Progress background line
                u.jsx("div", {
                  className: "absolute top-[16px] left-[15px] right-[15px] h-0.5 bg-border/40 z-0"
                }),
                // Progress filled line
                u.jsx("div", {
                  className: "absolute top-[16px] left-[15px] right-[15px] h-0.5 bg-red-brand origin-right transition-transform duration-300 z-0",
                  style: { transform: \`scaleX(\${(step - 1) / 3})\` }
                }),
                stepsDetails.map((st, idx) => {
                  const currentNum = idx + 1;
                  const isActive = step === currentNum;
                  const isCompleted = step > currentNum;
                  return u.jsxs("div",{
                    className:"flex flex-col items-center gap-1.5 z-10 flex-1 relative",
                    children:[
                      u.jsx("button",{
                        type:"button",
                        onClick:()=>{f?.("click");setStep(currentNum);},
                        className:\`flex h-8.5 w-8.5 items-center justify-center rounded-full font-black text-xs transition-all duration-300 \${
                          isActive?"bg-red-brand text-white ring-4 ring-red-brand/20 scale-110 shadow-lg":
                          isCompleted?"bg-green-600 text-white shadow-md":"bg-surface text-ink-faint border border-border"
                        }\`,
                        children:isCompleted?"✓":currentNum
                      }),
                      u.jsx("span", {
                        className: \`text-[10px] font-bold transition-all \${isActive ? "text-red-brand scale-105" : isCompleted ? "text-green-600" : "text-ink-faint"}\`,
                        children: a === "ar" ? st.labelAr : st.labelEn
                      })
                    ]
                  }, currentNum);
                })
              ]
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
                      a==="ar"?"border-red-brand bg-red-brand/5 shadow-md ring-2 ring-red-brand/20 scale-[1.03]":"border-border bg-surface hover:border-border-strong"
                    }\`,
                    children:[
                      u.jsx("span",{className:"text-4xl",children:"🇸🇦"}),
                      u.jsxs("div",{className:"text-center",children:[
                        u.jsx("span",{className:"block text-base font-bold text-ink",children:"العربية"}),
                        u.jsx("span",{className:"text-xs text-ink-soft",children:"Arabic"})
                      ]})
                    ]
                  }),
                  u.jsxs("button",{
                    type:"button",onClick:()=>{f?.("click");s("en");},
                    className:\`flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border-2 transition-all duration-200 active:scale-95 \${
                      a==="en"?"border-red-brand bg-red-brand/5 shadow-md ring-2 ring-red-brand/20 scale-[1.03]":"border-border bg-surface hover:border-border-strong"
                    }\`,
                    children:[
                      u.jsx("span",{className:"text-4xl",children:"🇬🇧"}),
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
                  u.jsx("p",{className:"text-xs text-ink-soft mt-1",children:a==="ar"?"يتغير تصميم التطبيق وألوانه فورًا حسب اختيارك مع عرض أنميشن مميز!":"App styling changes live as you choose with a beautiful transition!"})
                ]}),
                u.jsx("div",{
                  className:"grid grid-cols-1 gap-2.5 max-h-64 overflow-y-auto p-1 scrollbar-thin",
                  children:themes.map(t=>u.jsxs("button",{
                    type:"button",key:t.id,onClick:()=>{f?.("click");u2(t.id);},
                    className:\`flex items-center justify-between gap-3 p-3.5 rounded-xl border-2 text-start transition-all duration-200 active:scale-95 \${
                      c===t.id?"border-red-brand bg-red-brand/5 shadow-md ring-2 ring-red-brand/20 scale-[1.01]":"border-border bg-surface hover:border-border-strong"
                    }\`,
                    children:[
                      u.jsxs("div",{className:"flex items-center gap-2.5",children:[
                        u.jsx("div",{className:\`h-6.5 w-6.5 rounded-full bg-gradient-to-br \${t.color} border shadow-sm\`}),
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
                  u.jsx("p",{className:"text-xs text-ink-soft mt-1",children:a==="ar"?"سجل بالديسكورد للربط السريع وحفظ تقدمك أو استخدم اسمًا كزائر":"Sign in with Discord to save progress or set a guest nickname"})
                ]}),
                p?u.jsxs("div",{
                  className:"flex items-center justify-between gap-3 rounded-2xl border border-green-500/40 bg-green-500/10 p-4 animate-fadeIn",
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
                        const targetServer=window.__CLUE_ME_SERVER_URL__||(typeof window!=="undefined"?window.location.origin:"https://clue-me.ai.studio");
                        const authUrl=\`\${targetServer}/api/auth/discord?returnTo=\${ie}\`;
                        if(isCap){
                          window.open(authUrl,"_system");
                          return;
                        }
                        const popup=window.open(authUrl,"discord_auth","width=600,height=700,status=no,menubar=no,toolbar=no");
                        if(!popup||popup.closed)window.location.href=authUrl;
                      },
                      className:"flex h-12.5 w-full items-center justify-center gap-3 rounded-xl bg-[#5865F2] font-black text-white shadow-md hover:shadow-lg transition-all hover:bg-[#4752C4] active:scale-95",
                      children:[
                        u.jsx("svg",{className:"h-5 w-5 fill-current animate-bounce",viewBox:"0 0 127.14 96.36",children:u.jsx("path",{d:"M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,0,104.87,104.87,0,0,0,22.75,8.07,108.6,108.6,0,0,0,.7,72.8a105.2,105.2,0,0,0,32.22,16.29,77.7,77.7,0,0,0,6.89-11.11,68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a73.2,73.2,0,0,0,64.08,0c.87.68,1.76,1.36,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1,105.25,105.25,0,0,0,32.23-16.29A108.38,108.38,0,0,0,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.88,53,48.83,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.11,53,91.08,65.69,84.69,65.69Z"})}),
                        a==="ar"?"تسجيل الدخول بواسطة ديسكورد ✨":"Sign in with Discord ✨"
                      ]
                    }),
                    u.jsx("div",{className:"relative my-1 text-center",children:u.jsx("span",{className:"bg-surface px-2 text-[11px] font-bold text-ink-soft",children:a==="ar"?"أو أدخل اسمك للعب كزائر":"OR enter your guest display name"})}),
                    u.jsx(za,{
                      label:a==="ar"?"اسمك المستعار للعب كزائر":"Guest Display Name",
                      placeholder:a==="ar"?"لاعب 1":"Player 1",
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
                    u.jsxs("div",{className:"flex justify-between",children:[u.jsx("span",{children:a==="ar"?"اللاعب:":"Player:"}),u.jsx("span",{className:"text-ink",children:p?.name||name||"Guest"})]})
                  ]
                }),
                u.jsx("button",{
                  type:"button",onClick:handleFinish,
                  className:"mt-2 h-12.5 w-full rounded-2xl bg-red-brand font-bold text-white shadow-xl hover:bg-red-strong hover:shadow-2xl transition-all duration-200 active:scale-95 text-base flex items-center justify-center gap-2 animate-pulse",
                  children:a==="ar"?"ابدأ اللعب الآن 🚀":"Start Playing Now 🚀"
                })
              ]
            }):null,
            step<4?u.jsxs("div",{
              className:"flex items-center justify-between border-t border-border/40 pt-4 mt-2",
              children:[
                step>1?u.jsx("button",{
                  type:"button",onClick:()=>{f?.("click");setStep(s=>s-1);},
                  className:"px-4 py-2 rounded-xl border border-border bg-surface text-xs font-bold text-ink hover:bg-surface-soft active:scale-95 transition-all",
                  children:a==="ar"?"السابق":"Back"
                }):u.jsx("button",{
                  type:"button",onClick:handleCloseAndMark,
                  className:"px-4 py-2 rounded-xl text-xs font-bold text-ink-faint hover:text-ink hover:bg-surface-soft active:scale-95 transition-all",
                  children:a==="ar"?"تخطي الكل":"Skip Setup"
                }),
                u.jsx("button",{
                  type:"button",onClick:()=>{f?.("click");setStep(s=>s+1);},
                  className:"px-5 py-2 rounded-xl bg-red-brand text-xs font-bold text-white shadow-md hover:bg-red-strong hover:shadow-lg active:scale-95 transition-all flex items-center gap-1.5",
                  children:a==="ar"?"التالي ➔":"Next ➔"
                })
              ]
            }):null
          ]
        })
      }),
      animationActive?u.jsx(ThemeTransitionOverlay,{theme:animatingTheme}):null
    ]
  });
}
`;

// Replace SetupWizardModal in bundle
let wizardStart = code.indexOf('function ThemeTransitionOverlay({');
if (wizardStart === -1) {
  wizardStart = code.indexOf('function SetupWizardModal({');
}
const wizardEnd = code.indexOf('function QA({');
if (wizardStart !== -1 && wizardEnd !== -1) {
  code = code.slice(0, wizardStart) + setupWizardCode + '\n' + code.slice(wizardEnd);
  console.log('✅ SetupWizardModal updated successfully in bundle.');
} else {
  const qaPos = code.indexOf('function QA({');
  if (qaPos !== -1) {
    code = code.slice(0, qaPos) + setupWizardCode + '\n' + code.slice(qaPos);
    console.log('✅ SetupWizardModal defined and inserted.');
  }
}

// 4. Update QA Modal
if (!code.includes('معالج الإعداد التفاعلي')) {
  const newQA = `function QA({open:n,onClose:r,onOpenAdmin:a,onOpenSetup:st}){const{t:l}=Ve(),{settings:m,updateSettings:h}=G1(),g=o2();return u.jsx(qk,{open:n,onClose:r,title:l.settings.title,children:u.jsxs("div",{className:"flex flex-col gap-5",children:[u.jsxs("div",{className:"rounded-xl border border-border bg-surface-soft/60 p-4",children:[u.jsxs("div",{className:"flex items-center justify-between gap-3",children:[u.jsxs("span",{className:"inline-flex items-center gap-2 text-sm font-bold text-ink",children:[u.jsx(X1,{size:16,className:"text-red-brand","aria-hidden":"true"}),l.settings.sound]}),u.jsx(k1,{checked:!m.muted,ariaLabel:l.settings.mute,onChange:v=>{h({muted:!v}),v&&g("click")}})]}),u.jsxs("div",{className:"mt-4 flex flex-col gap-4",children:[u.jsx(Yh,{label:l.settings.masterVolume,value:m.master,onChange:v=>h({master:v})}),u.jsx(Yh,{label:l.settings.uiVolume,value:m.ui,onChange:v=>h({ui:v})}),u.jsx(Yh,{label:l.settings.gameVolume,value:m.game,onChange:v=>h({game:v})}),u.jsxs("div",{className:"flex items-center justify-between gap-3",children:[u.jsx("span",{className:"text-sm font-medium text-ink-soft",children:l.settings.haptics}),u.jsx(k1,{checked:m.haptics,ariaLabel:l.settings.haptics,onChange:v=>{h({haptics:v}),v&&g("click")}})]})]}),u.jsxs("div",{className:"flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 mt-3",children:[u.jsxs("span",{className:"inline-flex items-center gap-2 text-sm font-bold text-ink",children:[u.jsx(P1,{size:16,className:"text-amber-500","aria-hidden":"true"}),"معالج الإعداد التفاعلي"]}),u.jsx("button",{type:"button",onClick:()=>{r();if(typeof st==="function")st();},className:"inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-500 bg-amber-500 px-3 text-xs font-bold text-white shadow-sm transition-all hover:bg-amber-600 active:scale-95",children:"فتح الإعداد"})]}),u.jsxs("div",{className:"flex items-center justify-between gap-3 rounded-xl border border-red-pale bg-red-pale/20 p-3.5 mt-3",children:[u.jsxs("span",{className:"inline-flex items-center gap-2 text-sm font-bold text-ink",children:[u.jsx(ya,{size:16,className:"text-red-brand","aria-hidden":"true"}),l.admin?.title||"لوحة الإدارة"]}),u.jsx("button",{type:"button",onClick:()=>{r();if(typeof a==="function")a();else Sn("/admin")},className:"inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-brand bg-red-brand px-3 text-xs font-bold text-white shadow-sm transition-all hover:bg-red-brand/90 active:scale-95",children:l.admin?.title||"فتح الإدارة"})]})]}),u.jsxs("div",{className:"rounded-xl border border-border bg-surface-soft/60 p-4",children:[u.jsx("span",{className:"text-sm font-bold text-ink",children:l.settings.theme}),u.jsxs("div",{className:"mt-3 grid grid-cols-2 gap-2",children:[u.jsx(y1,{value:"light",label:l.settings.themeLight,icon:cl}),u.jsx(y1,{value:"dark",label:l.settings.themeDark,icon:fl})]})]})]})})} `;
  const qaStart = code.indexOf('function QA({');
  const qaEnd = code.indexOf('function JA({team:n}){');
  if (qaStart !== -1 && qaEnd !== -1) {
    code = code.slice(0, qaStart) + newQA + '\n' + code.slice(qaEnd);
    console.log('✅ QA Modal patched successfully.');
  }
}

// 5. Update HomePage (vk) to render SetupWizardModal WITH IMMEDIATE PRE-MARKING to avoid multiple auto-starts!
if (!code.includes('u.jsx(SetupWizardModal')) {
  const oldVkStart = code.indexOf('function vk({');
  const oldVkEnd = code.indexOf('function bk({');
  if (oldVkStart !== -1 && oldVkEnd !== -1) {
    const newVk = `function vk({onPlay:n,onRoom:r,onOpenAdmin:s,dialog:i=null,onCloseDialog:l}){const{t:f}=Ve(),[p,m]=T.useState(!1),[h,g]=T.useState(i==="create"),[v,k]=T.useState(i==="join"),[E,I]=T.useState(i==="login"),[U,j]=T.useState(!1),[H,Y]=T.useState(""),[te,le]=T.useState([]);const[setupOpen,setSetupOpen]=T.useState(()=>{if(typeof window!=="undefined"){const completed=localStorage.getItem("clue-me:setup-completed");if(!completed){try{localStorage.setItem("clue-me:setup-completed","true");}catch(ex){}return true;}}return false;});T.useEffect(()=>{g(i==="create"),k(i==="join"),I(i==="login")},[i]),T.useEffect(()=>{const ve=(new URLSearchParams(window.location.search).get("room")??"").toUpperCase();/^[A-Z]{4}$/.test(ve)&&Sn(Sr(ve),{replace:!0})},[]);const ge=ve=>()=>{ve(!1),i&&l?.()};return T.useEffect(()=>{le(Xv())},[]),u.jsxs("div",{className:"flex min-h-dvh flex-col",children:[u.jsx(tk,{onOpenAuth:()=>I(!0),onOpenProfile:()=>j(!0),onOpenAdmin:s,onOpenSetup:()=>setSetupOpen(!0)}),u.jsxs("main",{className:"flex-1",children:[u.jsx(lk,{onHowToPlay:()=>m(!0),onPlay:n,onCreateRoom:()=>g(!0),onJoinRoom:()=>{Y(""),k(!0)}}),te.length>0?u.jsxs("section",{className:"mx-auto max-w-6xl px-4 pb-14",children:[u.jsx("p",{className:"text-center text-xs font-bold uppercase tracking-wide text-ink-faint",children:f.share.recent}),u.jsx("div",{className:"mt-3 flex flex-wrap items-center justify-center gap-2",children:te.map(ve=>u.jsxs("button",{type:"button",onClick:()=>Sn(Sr(ve.code)),className:"inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-bold text-ink shadow-card transition-all duration-150 hover:border-border-strong hover:shadow-lift active:scale-[0.97]",title:ve.name,children:[u.jsx("span",{dir:"ltr",className:"tracking-[0.2em] text-red-brand",children:ve.code}),u.jsx("span",{className:"max-w-28 truncate text-xs font-medium text-ink-soft",dir:"auto",children:ve.name})]},ve.code))})]}):null,u.jsx(uk,{})]}),u.jsx(ek,{}),u.jsx(ck,{open:p,onClose:()=>m(!1)}),u.jsx(Bw,{open:E,onClose:ge(I)}),u.jsx($w,{open:U,onClose:()=>j(!1)}),u.jsx(dk,{open:h,onClose:ge(g),onCreated:(ve,ie)=>{g(!1),r(ve,ie)}}),u.jsx(fk,{open:v,initialCode:H,onClose:ge(k),onJoined:(ve,ie)=>{k(!1),r(ve,ie)}}),u.jsx(SetupWizardModal,{open:setupOpen,onClose:()=>setSetupOpen(!1)})]})} `;
    code = code.slice(0, oldVkStart) + newVk + '\n' + code.slice(oldVkEnd);
    console.log('✅ HomePage (vk) updated to render SetupWizardModal.');
  }
}

// 6. Update Header (tk) to pass onOpenSetup to QA
if (!code.includes('onOpenSetup:st')) {
  const tkHeaderOld = 'function tk({onOpenAuth:n,onOpenProfile:r,onOpenAdmin:s}){';
  const tkHeaderNew = 'function tk({onOpenAuth:n,onOpenProfile:r,onOpenAdmin:s,onOpenSetup:st}){';
  const tkQaOld = 'settingsOpen?u.jsx(QA,{open:settingsOpen,onClose:()=>setSettingsOpen(!1),onOpenAdmin:s}):null';
  const tkQaNew = 'settingsOpen?u.jsx(QA,{open:settingsOpen,onClose:()=>setSettingsOpen(!1),onOpenAdmin:s,onOpenSetup:st}):null';
  
  if (code.includes(tkHeaderOld)) code = code.replace(tkHeaderOld, tkHeaderNew);
  if (code.includes(tkQaOld)) code = code.replace(tkQaOld, tkQaNew);
  console.log('✅ Header (tk) updated with onOpenSetup.');
}

// 7. Patch Bw (Login Modal) to prevent variable shadowing and handle Capacitor safely
const oldBwGe = 'const ge=()=>{const ie=encodeURIComponent(`${window.location.pathname}${window.location.search}`);window.location.assign(`/api/auth/discord?returnTo=${ie}`)}';

const newBwGe = 'const ge=()=>{const isCap=typeof window!=="undefined"&&window.Capacitor;const ie=isCap?"clueme://auth/discord":encodeURIComponent(`${window.location.pathname}${window.location.search}`);const targetServer=window.__CLUE_ME_SERVER_URL__||(typeof window!=="undefined"?window.location.origin:"https://clue-me.ai.studio");const authUrl=`${targetServer}/api/auth/discord?returnTo=${ie}`;if(isCap){window.open(authUrl,"_system");r();return;}const popup=window.open(authUrl,"discord_auth","width=600,height=700,status=no,menubar=no,toolbar=no");if(popup&&!popup.closed){const timer=setInterval(async()=>{if(popup.closed){clearInterval(timer)}try{const res=await J_();if(res&&res.user){clearInterval(timer);try{popup.close()}catch(ex){}const{refresh:refreshAuth}=xa();await refreshAuth();r();}}catch(ex){}},1200)}else{window.location.href=authUrl;}}';

safeReplace('Bw login helper (prevent shadowing & crash)', oldBwGe, newBwGe);

// 8. Wrap Admin Panel tabs with a fully mobile responsive container
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
}

fs.writeFileSync(bundlePath, code, 'utf8');
console.log('Client bundle patching complete!');
