// General practice material. No claims about the contents of any student's textbook.
const banks={
 conjugation:[
  ['Au passé simple : il (faire)…','fit',['faisait','fera'],'À la 3e personne du singulier : il fit.'],
  ['Au passé simple : ils (faire)…','firent',['faisaient','feront'],'À la 3e personne du pluriel : ils firent.'],
  ['Au passé simple : il (venir)…','vint',['venait','vient'],'Venir : il vint, ils vinrent.'],
  ['Au passé simple : ils (prendre)…','prirent',['prenaient','prendront'],'Prendre : il prit, ils prirent.'],
  ['Au passé simple : elle (chanter)…','chanta',['chantait','chantera'],'Les verbes en -er prennent -a à la 3e personne du singulier.'],
  ['Au passé simple : elles (chanter)…','chantèrent',['chantaient','chanteront'],'Les verbes en -er prennent -èrent à la 3e personne du pluriel.'],
  ['Au passé simple : ils (être)…','furent',['étaient','seront'],'Être : il fut, ils furent.'],
  ['Au passé simple : elle (avoir)…','eut',['avait','aura'],'Avoir : elle eut, elles eurent.']
 ],
 electricity:[
  ['Pour qu’une lampe fonctionne dans un circuit simple alimenté, le circuit doit être…','fermé',['ouvert','sans générateur'],'Un circuit fermé permet au courant de circuler.'],
  ['Quel composant peut alimenter un circuit simple ?','Une pile',['Un interrupteur seul','Un fil seul'],'La pile est un générateur.'],
  ['Que fait un interrupteur ouvert ?','Il interrompt le courant',['Il augmente toujours le courant','Il remplace la pile'],'Ouvrir l’interrupteur coupe le circuit.'],
  ['Dans un montage en série, les composants sont…','dans une seule boucle',['toujours sans fil','dans plusieurs branches parallèles'],'Un montage en série comporte une seule boucle.'],
  ['Quel montage faut-il éviter avec une pile ?','Un court-circuit',['Un circuit avec une lampe adaptée','Un circuit ouvert'],'Un court-circuit peut provoquer un courant important et un échauffement.']
 ],
 food:[
  ['Que signifie « bread » ?','Pain',['Pomme','Eau'],'Bread signifie pain.'],
  ['Comment dit-on « eau » ?','Water',['Butter','Milk'],'Water signifie eau.'],
  ['Que signifie « vegetables » ?','Légumes',['Boissons','Desserts'],'Vegetables signifie légumes.'],
  ['Comment dit-on « fromage » ?','Cheese',['Chicken','Rice'],'Cheese signifie fromage.'],
  ['Que signifie « breakfast » ?','Petit-déjeuner',['Dîner','Déjeuner'],'Breakfast est le petit-déjeuner.']
 ]
};
function shuffle(a,rng){return a.map(value=>({value,key:rng()})).sort((a,b)=>a.key-b.key).map(x=>x.value);}
export function makePractice(theme,rng=Math.random){return shuffle(banks[theme]||banks.conjugation,rng).slice(0,5).map(([question,answer,wrong,why])=>({question,answer,choices:shuffle([answer,...wrong],rng),why}));}
