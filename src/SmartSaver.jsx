import React, { useState, useEffect, useRef } from 'react';
import { Camera, Calculator, X, Scan, DollarSign, Image as ImageIcon, Info, ArrowRight, CheckCircle, Search } from 'lucide-react';

const NUM_PATTERN = '[一二兩三四五六七八九十\\d\\.]+';

const chineseToNumber = (str) => {
  if (!str) return 0;
  const map = { 
    '一': 1, '二': 2, '兩': 2, '三': 3, '四': 4, '五': 5, 
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '半': 0.5 
  };
  const parsed = parseFloat(str);
  if (!isNaN(parsed)) return parsed;
  return map[str] || 0;
};

const analyzePromotion = (text) => {
  if (!text) return null;
  const cleanText = text.replace(/\s/g, '');

  const priceRegex = /(?:(\d+)\s*元)|(?:\$\s*(\d+))|(?:[一二兩三四五六七八九十\d]+件(\d+)(?![折%]))/g;
  const priceMatches = [...cleanText.matchAll(priceRegex)];
  const prices = priceMatches.map(m => parseFloat(m[1] || m[2] || m[3]));
  const basePrice = prices.length > 0 ? prices[0] : null; 

  const thresholdMatch = cleanText.match(new RegExp(`滿(${NUM_PATTERN})(?:元)?(?:現?折|省|送)(${NUM_PATTERN})`));
  if (thresholdMatch) {
    let threshold = chineseToNumber(thresholdMatch[1]);
    if (thresholdMatch[1].includes('千')) threshold = 1000;
    
    let discountAmount = chineseToNumber(thresholdMatch[2]);
    if (thresholdMatch[2].includes('百')) discountAmount = 100;

    if (threshold > 0) {
      const finalPrice = threshold - discountAmount;
      const discountRate = (finalPrice / threshold) * 10;
      
      return {
        type: 'Threshold',
        title: `滿${threshold}折${discountAmount}`,
        discount: `${discountRate.toFixed(1)} 折`,
        detail: `消費滿 $${threshold} 省 $${discountAmount}`,
        value: discountRate
      };
    }
  }

  const addOneRegex = new RegExp(`(?:加|多)(${NUM_PATTERN})元?(?:加|多|送)(${NUM_PATTERN})件`);
  const addOneMatch = cleanText.match(addOneRegex);
  
  if (addOneMatch && basePrice !== null) {
    const addPrice = chineseToNumber(addOneMatch[1]);
    const addCount = chineseToNumber(addOneMatch[2]);
    
    const totalCost = basePrice + addPrice;
    const totalCount = 1 + addCount;
    const originalValue = basePrice * totalCount;
    
    const discountRate = (totalCost / originalValue) * 10;

    return {
      type: 'AddOne',
      title: `加${addPrice}元多${addCount}件`,
      discount: `${discountRate.toFixed(1)} 折`,
      detail: `原價$${basePrice}，加$${addPrice}多${addCount}件。平均單件$${(totalCost/totalCount).toFixed(1)}`,
      value: discountRate
    };
  }

  const nthSaveMatch = cleanText.match(new RegExp(`第(${NUM_PATTERN})件(?:省|折|現折)(${NUM_PATTERN})元?`));
  if (nthSaveMatch && basePrice !== null) {
    const nth = chineseToNumber(nthSaveMatch[1]);
    const saveAmount = chineseToNumber(nthSaveMatch[2]);

    if (nth === 2) { 
      const totalCost = basePrice + (basePrice - saveAmount);
      const originalValue = basePrice * 2;
      const discountRate = (totalCost / originalValue) * 10;
      
      return {
        type: 'NthSave',
        title: `第${nth}件省${saveAmount}元`,
        discount: `${discountRate.toFixed(1)} 折`,
        detail: `原價$${basePrice}，第2件折$${saveAmount}。平均單件$${totalCost/2}`,
        value: discountRate
      };
    }
  }

  const buyGetMatch = cleanText.match(new RegExp(`買(${NUM_PATTERN})送(${NUM_PATTERN})`));
  if (buyGetMatch) {
    const buy = chineseToNumber(buyGetMatch[1]);
    const get = chineseToNumber(buyGetMatch[2]);
    
    if (buy > 0 && get > 0) {
      const totalItems = buy + get;
      const avgDiscount = (buy / totalItems) * 10;

      return {
        type: 'BOGO',
        title: `買${buy}送${get}`,
        discount: `${avgDiscount.toFixed(1)} 折`,
        detail: `買 ${buy} 拿 ${totalItems}，相當於 ${avgDiscount.toFixed(2)} 折`,
        value: avgDiscount
      };
    }
  }

  const nthItemMatch = cleanText.match(new RegExp(`第(${NUM_PATTERN})件(${NUM_PATTERN}|半)折?`));
  if (nthItemMatch) {
    const nth = chineseToNumber(nthItemMatch[1]);
    const rawDiscount = nthItemMatch[2];
    let discountVal = chineseToNumber(rawDiscount);

    let priceFactor = 1;
    if (rawDiscount === '半' || discountVal === 0.5) { 
      priceFactor = 0.5; discountVal = 5; 
    } else if (discountVal < 10) { 
      priceFactor = discountVal / 10; 
    } else { 
      priceFactor = discountVal / 100; 
    }

    if (nth > 1) {
      const totalCost = (nth - 1) * 1 + priceFactor;
      const finalDiscount = (totalCost / nth) * 10;

      return {
        type: 'NthItem',
        title: `第${nth}件${discountVal}折`,
        discount: `${finalDiscount.toFixed(1)} 折`,
        detail: `購買 ${nth} 件平均，實際為 ${finalDiscount.toFixed(2)} 折`,
        value: finalDiscount
      };
    }
  }

  if (cleanText.includes('買') && cleanText.includes('送') && prices.length >= 2) {
    const priceA = prices[0];
    const priceB = prices[1];
    const totalValue = priceA + priceB;
    const discountRate = (priceA / totalValue) * 10;

    return {
      type: 'BuyAGetB',
      title: '買A送B (不同價)',
      discount: `${discountRate.toFixed(1)} 折`,
      detail: `買$${priceA}送$${priceB}。總值$${totalValue}，僅付$${priceA}`,
      value: discountRate
    };
  }

  if (!cleanText.includes('第')) {
    const groupMatch = cleanText.match(new RegExp(`(${NUM_PATTERN})件(${NUM_PATTERN}|半)折`));
    if (groupMatch) {
      const count = chineseToNumber(groupMatch[1]);
      let dVal = chineseToNumber(groupMatch[2]);
      if (dVal === 0.5 || groupMatch[2] === '半') dVal = 5;
      
      return {
        type: 'GroupDisc',
        title: `${count}件${dVal}折`,
        discount: `${dVal} 折`,
        detail: `全部商品皆享 ${dVal} 折優惠`,
        value: dVal
      };
    }
  }

  const simpleMatch = cleanText.match(/([\d\.]+)折/);
  if (simpleMatch) {
    let val = parseFloat(simpleMatch[1]);
    let finalDiscount = val < 10 ? val : val / 10;
    return {
      type: 'Simple',
      title: '直接折扣',
      discount: `${finalDiscount} 折`,
      detail: `直接省下 ${Math.round((10 - finalDiscount)*10)}%`,
      value: finalDiscount
    };
  }

  return {
    type: 'Unknown',
    title: '無法翻譯',
    discount: '?',
    detail: '請輸入包含金額的文案，或標準折扣語法 (如: 買一送一)',
    value: 0
  };
};

const FeaturePromoDecoder = () => {
  const [analyzedText, setAnalyzedText] = useState("");
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      simulateOCR();
    }
  };

  const simulateOCR = () => {
    setIsAnalyzing(true);
    setResult(null);
    setAnalyzedText("AI 辨識中...");
    
    setTimeout(() => {
      const mockResults = [
        "1件50 加一元多一件",
        "買2送一",
        "第2件半價",
        "1件100元，加10元多一件",
        "滿千送百"
      ];
      const randomText = mockResults[Math.floor(Math.random() * mockResults.length)];
      setAnalyzedText(randomText);
      setResult(analyzePromotion(randomText));
      setIsAnalyzing(false);
    }, 1200);
  };

  const handleManualInput = (e) => {
    const text = e.target.value;
    setAnalyzedText(text);
    if (text.length > 2) {
       setResult(analyzePromotion(text));
    } else {
       setResult(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-blue-500 to-cyan-400 text-white">
      <div className="pt-6 pb-2 px-6">
        <h1 className="text-2xl font-bold flex items-center gap-2 drop-shadow-md">
          <Scan className="w-6 h-6" />
          優惠翻譯蒟蒻
        </h1>
        <p className="text-blue-50 text-sm mt-1 opacity-90 font-light">看不懂廣告話術？拍照或輸入讓我幫你算！</p>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        
        <div className="mt-4 mb-6 relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input 
                type="text" 
                value={analyzedText}
                onChange={handleManualInput}
                placeholder="輸入優惠文案..."
                className="w-full bg-white/20 backdrop-blur-md pl-4 pr-10 py-4 rounded-2xl text-lg font-medium outline-none text-white placeholder-blue-100 shadow-inner border border-white/20 transition-all focus:bg-white/30"
              />
              {isAnalyzing && (
                <div className="absolute right-3 top-4">
                  <Scan className="animate-spin text-white w-5 h-5" />
                </div>
              )}
            </div>
            
            <button 
              onClick={() => fileInputRef.current.click()}
              className="bg-white/20 backdrop-blur-md border border-white/20 hover:bg-white/30 text-white p-4 rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center aspect-square"
            >
              <Camera size={24} />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
              accept="image/*" 
              className="hidden" 
            />
          </div>
          
          <div className="mt-4 px-2 text-xs text-blue-100 space-y-2">
            <p className="font-medium opacity-80">嘗試輸入：</p>
            <div className="flex flex-wrap gap-2">
               <span onClick={()=>setAnalyzedText("買一送一")} className="bg-white/10 border border-white/10 px-3 py-1.5 rounded-full cursor-pointer hover:bg-white/20 transition">買一送一</span>
               <span onClick={()=>setAnalyzedText("1件50 加一元多一件")} className="bg-white/10 border border-white/10 px-3 py-1.5 rounded-full cursor-pointer hover:bg-white/20 transition">1件50 加一元多一件</span>
               <span onClick={()=>setAnalyzedText("1件50元加1元多1件")} className="bg-white/10 border border-white/10 px-3 py-1.5 rounded-full cursor-pointer hover:bg-white/20 transition">1件50元加1元多1件</span>
            </div>
          </div>
        </div>

        {result ? (
          <div className="bg-black/20 backdrop-blur-xl border border-white/10 rounded-3xl p-6 text-white shadow-2xl transform transition-all animate-in zoom-in-95 duration-300">
             <div className="flex items-start justify-between">
                <div>
                  <div className="text-blue-100 text-sm font-medium mb-1">翻譯結果</div>
                  <h2 className="text-5xl font-bold tracking-tight text-white drop-shadow-sm">{result.discount}</h2>
                </div>
                <div className="bg-green-400/20 p-2 rounded-full border border-green-400/30">
                  <CheckCircle className="w-6 h-6 text-green-300" />
                </div>
             </div>
             
             <div className="mt-6 pt-4 border-t border-white/10">
                <h3 className="text-xl font-bold mb-2">{result.title}</h3>
                <p className="text-blue-50 text-sm leading-relaxed opacity-90">{result.detail}</p>
             </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 opacity-30 text-white border-2 border-dashed border-white/20 rounded-3xl mt-8">
             <Search size={48} className="mb-4" />
             <p>等待輸入中...</p>
          </div>
        )}

      </div>
    </div>
  );
};

const FeaturePriceCompare = () => {
  const [priceA, setPriceA] = useState('');
  const [amountA, setAmountA] = useState('');
  
  const [priceB, setPriceB] = useState('');
  const [amountB, setAmountB] = useState('');

  const calculateUnit = (p, a) => {
    const pf = parseFloat(p);
    const af = parseFloat(a);
    if (pf && af && af > 0) return pf / af;
    return null;
  };

  const unitA = calculateUnit(priceA, amountA);
  const unitB = calculateUnit(priceB, amountB);

  let comparison = null;
  let ratio = 1;

  if (unitA !== null && unitB !== null) {
    if (unitA < unitB) {
      comparison = 'A';
      ratio = unitB / unitA;
    } else if (unitB < unitA) {
      comparison = 'B';
      ratio = unitA / unitB;
    } else {
      comparison = 'Equal';
    }
  }

  const InputCard = ({ label, price, setPrice, amount, setAmount, unit, isWinner }) => (
    <div className={`rounded-3xl p-5 transition-all duration-300 border backdrop-blur-md relative overflow-hidden ${isWinner ? 'bg-white/20 border-white/40 shadow-xl scale-[1.02] z-10' : 'bg-white/10 border-white/10 shadow-sm'}`}>
      
      {isWinner && (
        <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow-sm">
          最划算
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <span className={`font-bold text-lg ${isWinner ? 'text-white' : 'text-blue-50 opacity-80'}`}>{label}</span>
      </div>
      
      <div className="flex gap-3">
        <div className="flex-1">
           <label className="text-[10px] text-blue-100 block mb-1 opacity-70">價格 ($)</label>
           <input 
             type="number" 
             value={price}
             onChange={(e) => setPrice(e.target.value)}
             className="w-full bg-black/10 border border-white/5 p-3 rounded-xl text-lg font-semibold text-white placeholder-white/20 outline-none focus:bg-black/20 transition"
             placeholder="0"
           />
        </div>
        <div className="flex-1">
           <label className="text-[10px] text-blue-100 block mb-1 opacity-70">單位 (g/ml)</label>
           <input 
             type="number" 
             value={amount}
             onChange={(e) => setAmount(e.target.value)}
             className="w-full bg-black/10 border border-white/5 p-3 rounded-xl text-lg font-semibold text-white placeholder-white/20 outline-none focus:bg-black/20 transition"
             placeholder="0"
           />
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
         <span className="text-xs text-blue-100 opacity-60">每單位價格</span>
         <span className={`font-mono font-bold text-xl ${isWinner ? 'text-yellow-300' : 'text-white/60'}`}>
           {unit !== null ? `$${unit.toFixed(4)}` : '--'}
         </span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-blue-500 to-cyan-400 text-white">
      <div className="pt-6 pb-2 px-6">
        <h1 className="text-2xl font-bold flex items-center gap-2 drop-shadow-md">
          <Calculator className="w-6 h-6" />
          單價比價
        </h1>
        <p className="text-blue-50 text-sm mt-1 opacity-90 font-light">同時輸入兩項商品，找出誰更便宜</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        <InputCard 
          label="商品 A" 
          price={priceA} setPrice={setPriceA} 
          amount={amountA} setAmount={setAmountA} 
          unit={unitA} 
          isWinner={comparison === 'A'} 
        />

        <div className="flex justify-center -my-4 relative z-0">
          <div className="bg-white/20 backdrop-blur-sm border border-white/20 rounded-full p-2 text-white shadow-lg">
             <ArrowRight className="rotate-90 opacity-80" size={20} />
          </div>
        </div>

        <InputCard 
          label="商品 B" 
          price={priceB} setPrice={setPriceB} 
          amount={amountB} setAmount={setAmountB} 
          unit={unitB} 
          isWinner={comparison === 'B'} 
        />

        {comparison && (
           <div className="bg-black/30 backdrop-blur-xl border border-white/10 rounded-2xl p-5 mt-2 animate-in slide-in-from-bottom-5 shadow-2xl">
              <div className="flex items-start gap-4">
                 <Info className="text-yellow-400 shrink-0 mt-1" size={24} />
                 <div>
                    {comparison === 'Equal' ? (
                      <p className="font-bold text-lg">兩者單價完全相同！</p>
                    ) : (
                      <div className="text-white">
                        <p className="font-bold text-lg mb-1">
                          <span className="text-yellow-400">商品 {comparison}</span> 比較便宜！
                        </p>
                        <p className="text-sm opacity-80 text-blue-50">
                          每單位價格便宜了 <span className="text-white font-bold">{(ratio).toFixed(1)}倍</span> (約省下 {((1 - 1/ratio)*100).toFixed(0)}%)
                        </p>
                      </div>
                    )}
                 </div>
              </div>
           </div>
        )}

      </div>
    </div>
  );
};

const App = () => {
  const [activeTab, setActiveTab] = useState('decoder');

  return (
    <div className="font-sans text-gray-900 bg-gray-200 h-screen w-full flex justify-center items-center overflow-hidden">
      <div className="w-full h-full max-w-md bg-white relative flex flex-col shadow-2xl overflow-hidden sm:rounded-[3rem] sm:h-[90vh] sm:border-[8px] sm:border-gray-800">
        
        <div className="flex-1 overflow-hidden relative">
          {activeTab === 'decoder' ? <FeaturePromoDecoder /> : <FeaturePriceCompare />}
        </div>

        <div className="bg-white/95 backdrop-blur-md border-t border-gray-100 px-6 py-2 flex justify-around items-center shrink-0 pb-6 sm:pb-2 z-20">
          <button 
            onClick={() => setActiveTab('decoder')}
            className={`flex flex-col items-center space-y-1 p-2 transition duration-200 ${activeTab === 'decoder' ? 'text-blue-600 scale-105' : 'text-gray-400 hover:text-gray-500'}`}
          >
            <Scan size={24} strokeWidth={activeTab === 'decoder' ? 2.5 : 2} />
            <span className="text-[10px] font-medium">翻譯蒟蒻</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('compare')}
            className={`flex flex-col items-center space-y-1 p-2 transition duration-200 ${activeTab === 'compare' ? 'text-blue-600 scale-105' : 'text-gray-400 hover:text-gray-500'}`}
          >
            <Calculator size={24} strokeWidth={activeTab === 'compare' ? 2.5 : 2} />
            <span className="text-[10px] font-medium">單價比價</span>
          </button>
        </div>
        
        <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-gray-300 rounded-full sm:hidden z-30"></div>
      </div>
    </div>
  );
};

export default App;