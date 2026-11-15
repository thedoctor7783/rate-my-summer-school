const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const engine=html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const ctx=vm.createContext({});vm.runInContext(engine,ctx);
vm.runInContext(`
const book={rule:'book'};
for(let total=0;total<=8;total++)if(required(total,1,book)!==[0,1,1,2,2,2,3,3,3][total])throw Error('Table mismatch');
if(neighbors(Array(9).fill(1),3,0).total!==3)throw Error('Corner wraps');
if(neighbors(Array(9).fill(1),3,4).total!==8)throw Error('Center wrong');
if(!satisfied([1,0,0,0],2,0,book))throw Error('Isolation rule');
if(required(3,1,{rule:'fraction',a:50,b:100/3})!==2)throw Error('Fraction rounding');
if(required(3,2,{rule:'fraction',a:50,b:100/3})!==1)throw Error('One third rounding');
if(satisfied([1,0,0,0],2,0,{rule:'count',a:3,b:3}))throw Error('Count isolation');
if(required(8,1,{rule:'asymmetric'})!==4||required(8,2,{rule:'asymmetric'})!==2)throw Error('Asymmetric rules');
// An adjacent vacancy cannot count the moving piece as its own neighbor.
const origin=[1,2,0,0];
if(destinations(origin,2,0,book).length)throw Error('Origin was not vacated');
// Check 100 randomized complete runs: every move is to the nearest satisfying vacancy.
for(let trial=0;trial<100;trial++){
 let board=shuffle([...Array(22).fill(1),...Array(23).fill(2),...Array(19).fill(0)]),seen=new Set();
 for(let move=0;move<1000;move++){
  const key=board.join('');if(seen.has(key))break;seen.add(key);
  const list=candidates(board,8,book,'scan');let didMove=false;
  for(const from of list){const legal=destinations(board,8,from,book);if(!legal.length)continue;
   const to=legal[0],group=board[from],dist=(Math.floor(from/8)-Math.floor(to/8))**2+(from%8-to%8)**2;
   for(let j=0;j<64;j++)if(!board[j]&&satisfied(board,8,j,book,group,from)){
    const d=(Math.floor(from/8)-Math.floor(j/8))**2+(from%8-j%8)**2;if(d<dist)throw Error('Not nearest');
   }
   board[from]=0;board[to]=group;
   if(!satisfied(board,8,to,book))throw Error('Arrival unhappy');
   if(board.filter(g=>g===1).length!==22||board.filter(g=>g===2).length!==23)throw Error('Population changed');
   didMove=true;break;
  }
  if(!didMove)break;
 }
}
`,ctx);
for(const [,script] of html.matchAll(/<script(?: id="engine")?>([\s\S]*?)<\/script>/g))new vm.Script(script);
console.log('Passed: book table, boundaries, isolation, alternative rules, vacated-origin check, 100 randomized legal-move runs, script syntax.');
