const STORAGE_KEY = 'email_response_builder_v7_v3_ui';
const LEGACY_KEYS = ['email_response_builder_v3_quote','email_response_builder_clean_v6','email_response_builder_v1'];
const QUOTE_ITEMS_JSON_URL = 'quote-items.json';
const EMAIL_ELEMENTS_JSON_URL = 'email-elements.json';
const tabCount = 7;
const quoteTabIndex = 6;
let activeTab = 0;
let editingId = null;
let editingItemId = null;
let manageItems = false;
let pendingImportMode = 'merge';
let pendingElementsImportMode = 'merge';
let editingPackageId = null;
let draggedSelectedId = null;
let highlightedQuoteItemIndex = 0;
let selectedSnippetId = null;
let sortElementsMode = false;
const HAD_LOCAL_DATA_ON_LOAD = !!localStorage.getItem(STORAGE_KEY) || LEGACY_KEYS.some(function(key){ return !!localStorage.getItem(key); });

const defaultIntroMap = {
  commercial_ex: 'Hi [Client Name],\n\nThank you for your enquiry.\n\nThe cost of hire is as follows (these prices are EX-gst) -',
  commercial_inc: 'Hi [Client Name],\n\nThank you for your enquiry.\n\nThe cost of hire is as follows -',
  private_residential: 'Hi [Client Name],\n\nThank you for your enquiry.\n\nThe cost of hire is as follows -',
  private_hired_venue: 'Hi [Client Name],\n\nThank you for your enquiry.\n\nThe cost of hire is as follows -'
};

const defaultItems = [
  ['Example Item 1', 120], ['Example Item 2', 180], ['Example Item 3', 250], ['Example Item 4', 320], ['Example Item 5', 400]
].map(function(pair){ return {id: makeId(), name: pair[0], price: pair[1]}; });

const starterData = Array.from({length: tabCount}, function(_, i){
  return {
    name: i === 6 ? 'Quote Builder' : 'Tab ' + (i + 1),
    snippets: i === 0 ? [
      {id: makeId(), title: 'Greeting', body: 'Hi [Client Name],\n\nThanks for getting in touch.'},
      {id: makeId(), title: 'Request more information', body: 'Could you please send through a few more details so I can look into this properly?'},
      {id: makeId(), title: 'Closing', body: 'Kind regards,\n[Your Name]'}
    ] : []
  };
});

function makeId(){
  if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function loadData(){
  try{
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(saved) return normalizeData(saved);
  }catch(e){}
  for(const key of LEGACY_KEYS){
    try{
      const saved = JSON.parse(localStorage.getItem(key));
      if(saved) return normalizeData(saved);
    }catch(e){}
  }
  return normalizeData({tabs: starterData, drafts: {}, quote: {}});
}

async function loadQuoteItemsFromJson(){
  try{
    const response = await fetch(QUOTE_ITEMS_JSON_URL, {cache: 'no-store'});
    if(!response.ok) throw new Error('quote-items.json not found');

    const imported = await response.json();
    if(!Array.isArray(imported)) throw new Error('quote-items.json must be an array');

    const cleanItems = imported
      .filter(function(item){ return item && String(item.name || '').trim(); })
      .map(function(item){
        return {
          id: item.id || makeId(),
          name: String(item.name || '').trim(),
          price: Number(item.price || 0),
          weeklyExcluded: !!item.weeklyExcluded
        };
      });

    if(!cleanItems.length) return;

    data.quote.items = cleanItems;

    // Keep already-selected items in sync with matching inventory names where possible.
    data.quote.selected = data.quote.selected.map(function(sel){
      const match = cleanItems.find(function(item){
        return item.name.trim().toLowerCase() === String(sel.name || '').trim().toLowerCase();
      });
      if(match){
        sel.itemId = match.id;
        sel.name = match.name;
        sel.price = match.price;
        sel.weeklyExcluded = !!match.weeklyExcluded;
      }
      return sel;
    });

    save();
    renderQuoteItems();
    renderPackageList();
    buildQuoteText();
  }catch(err){
    console.warn('Using local quote items. Remote JSON could not be loaded:', err.message);
  }
}

async function loadEmailElementsFromJson(){
  try{
    const response = await fetch(EMAIL_ELEMENTS_JSON_URL, {cache: 'no-store'});
    if(!response.ok) throw new Error('email-elements.json not found');

    const imported = await response.json();
    const cleanTabs = normalizeImportedEmailElements(imported);
    if(!cleanTabs.length) return;

    cleanTabs.forEach(function(tab, index){
      if(index >= quoteTabIndex) return;
      data.tabs[index].name = tab.name || ('Tab ' + (index + 1));
      data.tabs[index].snippets = tab.snippets || [];
    });

    save();
    renderTabs();
    loadTabNameField();
    renderSnippets();
  }catch(err){
    console.warn('Using local saved email elements. Remote JSON could not be loaded:', err.message);
  }
}

function normalizeImportedEmailElements(imported){
  const rawTabs = Array.isArray(imported) ? imported : (imported && Array.isArray(imported.tabs) ? imported.tabs : []);
  return rawTabs.slice(0, quoteTabIndex).map(function(tab, index){
    const source = tab || {};
    const snippets = Array.isArray(source.snippets) ? source.snippets : [];
    return {
      name: String(source.name || ('Tab ' + (index + 1))).trim() || ('Tab ' + (index + 1)),
      snippets: snippets
        .filter(function(s){ return s && (String(s.title || '').trim() || String(s.body || '').trim()); })
        .map(function(s){
          return {
            id: s.id || makeId(),
            title: String(s.title || 'Untitled element').trim() || 'Untitled element',
            body: String(s.body || '')
          };
        })
    };
  });
}

function normalizeData(raw){
  const data = raw || {};
  if(!data.tabs || !Array.isArray(data.tabs) || data.tabs.length !== tabCount) data.tabs = starterData;
  data.tabs[6].name = 'Quote Builder';
  if(!data.drafts) data.drafts = {};
  if(!data.quote) data.quote = {};
  if(!Array.isArray(data.quote.items)) data.quote.items = defaultItems;
  data.quote.items = data.quote.items.map(function(item){
    return {id: item.id || makeId(), name: item.name || 'Untitled item', price: Number(item.price || 0), weeklyExcluded: !!item.weeklyExcluded};
  });
  if(!Array.isArray(data.quote.selected)) data.quote.selected = [];
  data.quote.selected = data.quote.selected.map(function(item){
    return {id: item.id || makeId(), itemId: item.itemId || item.id || makeId(), name: item.name || 'Untitled item', price: Number(item.price || 0), qty: Math.max(1, Number(item.qty || 1)), weeklyExcluded: !!item.weeklyExcluded};
  });
  if(data.quote.clientType === 'commercial') data.quote.clientType = 'commercial_ex';
  if(data.quote.clientType === 'private') data.quote.clientType = 'private_residential';
  if(data.quote.clientType === 'private_venue') data.quote.clientType = 'private_hired_venue';
  if(!data.quote.clientType) data.quote.clientType = 'commercial_ex';
  if(!data.quote.intros) data.quote.intros = {};
  Object.keys(defaultIntroMap).forEach(function(key){
    if(!data.quote.intros[key]) data.quote.intros[key] = defaultIntroMap[key];
  });
  if(data.quote.intro && data.quote.intro.indexOf('Thanks for your enquiry. Please see pricing below') === -1){
    data.quote.intros[data.quote.clientType] = data.quote.intro;
  }
  if(typeof data.quote.afterhours === 'undefined') data.quote.afterhours = false;
  if(typeof data.quote.weeklyHire === 'undefined') data.quote.weeklyHire = false;
  if(typeof data.quote.deliveryFee === 'undefined' || data.quote.deliveryFee === null) data.quote.deliveryFee = defaultDeliveryFor(data.quote.clientType);
  if(typeof data.quote.client === 'undefined') data.quote.client = '';
  if(typeof data.quote.output === 'undefined') data.quote.output = '';
  if(!Array.isArray(data.quote.packages)) data.quote.packages = [];
  data.quote.packages = data.quote.packages.map(function(pkg){
    return {
      id: pkg.id || makeId(),
      name: pkg.name || 'Untitled package',
      itemIds: Array.isArray(pkg.itemIds) ? pkg.itemIds : []
    };
  });
  delete data.quote.closing;
  return data;
}

let data = loadData();
if(typeof data.darkMode === 'undefined') data.darkMode = false;

function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
function $(id){ return document.getElementById(id); }

function applyTheme(){
  document.body.classList.toggle('dark', data.darkMode === true);
  const btn = $('darkToggle');
  if(btn) btn.textContent = data.darkMode ? 'Light mode' : 'Dark mode';
}

function money(n){ return '$' + Number(n || 0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2}); }
function defaultDeliveryFor(type){
  if(type === 'private_residential') return 0;
  if(type === 'private_hired_venue') return 200;
  return 350;
}
function escapeText(str){
  return String(str).replace(/[&<>"']/g, function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m];});
}

const tabsEl = $('tabs');
const listEl = $('snippetList');
const outEl = $('emailOutput');

function renderTabs(){
  tabsEl.innerHTML = '';
  data.tabs.forEach(function(tab, idx){
    const b = document.createElement('button');
    b.className = 'tab' + (idx === activeTab ? ' active' : '');
    b.textContent = tab.name || ('Tab ' + (idx + 1));
    b.onclick = function(){ switchTab(idx); };
    tabsEl.appendChild(b);
  });
  const activeName = data.tabs[activeTab] ? data.tabs[activeTab].name : ('Tab ' + (activeTab + 1));
  $('activeTabLabel').textContent = activeName;
  const titleText = $('activeTabTitleText');
  if(titleText) titleText.textContent = activeName;
  $('emailMode').classList.toggle('hidden', activeTab === quoteTabIndex);
  $('quoteMode').classList.toggle('hidden', activeTab !== quoteTabIndex);
}

function loadTabNameField(){
  const box = $('tabRenameBox');
  const input = $('tabNameInput');
  const button = $('renameTab');
  if(!box || !input || !button) return;

  input.value = data.tabs[activeTab].name || ('Tab ' + (activeTab + 1));

  const locked = activeTab === quoteTabIndex;
  input.disabled = locked;
  button.disabled = locked;
  box.classList.add('hidden');
}

function renderSnippets(){
  const q = $('search').value.trim().toLowerCase();
  const sourceSnippets = data.tabs[activeTab].snippets || [];
  const snippets = sourceSnippets.filter(function(s){ return !q || (s.title + plainTextFromHtml(s.body)).toLowerCase().includes(q); });
  listEl.innerHTML = '';
  listEl.classList.toggle('sort-mode', !!sortElementsMode);
  const sortBtn = $('sortElements');
  if(sortBtn) sortBtn.textContent = sortElementsMode ? 'Done' : 'Sort';
  if(!snippets.length){ listEl.innerHTML = '<div class="empty">No elements yet for this tab.</div>'; return; }

  function getDragAfterElement(container, y){
    const draggableElements = Array.from(container.querySelectorAll('.snippet:not(.dragging)'));
    return draggableElements.reduce(function(closest, child){
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if(offset < 0 && offset > closest.offset){
        return {offset: offset, element: child};
      }
      return closest;
    }, {offset: Number.NEGATIVE_INFINITY}).element;
  }

  listEl.ondragover = function(e){
    if(!sortElementsMode) return;
    e.preventDefault();
    const afterElement = getDragAfterElement(listEl, e.clientY);
    const dragging = document.querySelector('#snippetList .snippet.dragging');
    if(!dragging) return;
    if(afterElement == null){
      listEl.appendChild(dragging);
    } else {
      listEl.insertBefore(dragging, afterElement);
    }
  };

  listEl.ondrop = function(e){
    if(!sortElementsMode) return;
    e.preventDefault();
    const orderedIds = Array.from(listEl.querySelectorAll('.snippet')).map(function(el){ return el.dataset.snippetId; });
    const current = data.tabs[activeTab].snippets || [];
    const orderedSet = new Set(orderedIds);
    const reorderedVisible = orderedIds.map(function(id){ return current.find(function(s){ return s.id === id; }); }).filter(Boolean);
    const hidden = current.filter(function(s){ return !orderedSet.has(s.id); });
    data.tabs[activeTab].snippets = reorderedVisible.concat(hidden);
    save();
    renderSnippets();
  };

  snippets.forEach(function(s){
    const div = document.createElement('div');
    div.className = 'snippet' + (s.id === selectedSnippetId ? ' selected' : '') + (sortElementsMode ? ' sorting' : '');
    div.draggable = !!sortElementsMode;
    div.dataset.snippetId = s.id;
    div.innerHTML = '<div class="snippet-card-top"><div style="min-width:0"><div class="item-title" style="justify-content:flex-start;gap:6px"><span class="drag-handle-small">☰</span><strong></strong></div><div class="snippet-preview"></div></div><div class="snippet-icon-actions"><button class="secondary icon-btn add" title="Add to email" aria-label="Add to email">+</button><button class="ghost icon-btn copy" title="Copy styled element" aria-label="Copy styled element"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button><button class="danger icon-btn snippet-delete-sort" title="Delete element" aria-label="Delete element">×</button></div></div><span class="small item-copy-status"></span>';
    div.querySelector('strong').textContent = s.title;
    div.querySelector('.snippet-preview').textContent = plainTextFromHtml(s.body).slice(0, 180);
    div.onclick = function(e){
      if(sortElementsMode || e.target.closest('button')) return;
      openElementEditor(s.id);
    };
    div.addEventListener('dragstart', function(){
      if(!sortElementsMode) return;
      div.classList.add('dragging');
    });
    div.addEventListener('dragend', function(){
      div.classList.remove('dragging');
    });
    div.querySelector('.add').onclick = function(e){ e.stopPropagation(); addToEmail(plainTextFromHtml(s.body)); };
    div.querySelector('.copy').onclick = function(e){ e.stopPropagation(); copyStyledHtml(s.body.indexOf('<') >= 0 ? s.body : htmlFromPlainText(s.body), div.querySelector('.item-copy-status')); };
    div.querySelector('.snippet-delete-sort').onclick = function(e){ e.stopPropagation(); deleteSnippet(s.id); };
    listEl.appendChild(div);
  });
}

function plainTextFromHtml(html){
  const tmp = document.createElement('div');
  tmp.innerHTML = String(html || '').replace(/\n/g, '<br>');
  return tmp.innerText || tmp.textContent || '';
}
function htmlFromPlainText(text){
  return escapeText(text || '').replace(/\n/g, '<br>');
}
function openElementEditor(id){
  const s = data.tabs[activeTab].snippets.find(function(x){ return x.id === id; });
  if(!s) return;
  selectedSnippetId = id;
  editingId = id;
  $('editorTitle').value = s.title;
  $('richEditor').innerHTML = s.body.indexOf('<') >= 0 ? s.body : htmlFromPlainText(s.body);
  $('saveSnippet').textContent = 'Add element';
  renderSnippets();
}
function clearEditor(){
  selectedSnippetId = null;
  editingId = null;
  if($('editorTitle')) $('editorTitle').value = '';
  if($('richEditor')) $('richEditor').innerHTML = '';
}


function switchTab(idx){
  data.drafts[activeTab] = outEl.value;
  activeTab = idx;
  outEl.value = data.drafts[activeTab] || '';
  editingId = null;
  selectedSnippetId = null;
  sortElementsMode = false;
  clearEditor();
  $('snippetTitle').value = '';
  $('snippetBody').value = '';
  $('saveSnippet').textContent = 'Add element';
  $('search').value = '';
  save();
  $('darkToggle').onclick = function(){ data.darkMode = !data.darkMode; save(); applyTheme(); };
applyTheme();
renderTabs();
  loadTabNameField();
  if(activeTab === quoteTabIndex){ loadQuoteFields(); renderQuoteItems(); buildQuoteText(); setTimeout(function(){ if($('itemSearch')) $('itemSearch').focus(); }, 0); }
  else renderSnippets();
}

function addToEmail(text){
  const current = outEl.value.trimEnd();
  outEl.value = current ? current + '\n\n' + text : text;
  data.drafts[activeTab] = outEl.value;
  save();
  outEl.focus();
}
function editSnippet(id){
  openElementEditor(id);
}

function deleteSnippet(id){
  data.tabs[activeTab].snippets = data.tabs[activeTab].snippets.filter(function(s){ return s.id !== id; });
  if(selectedSnippetId === id) clearEditor();
  save(); renderSnippets();
}

$('saveSnippet').onclick = function(){
  const title = $('snippetTitle').value.trim() || 'Untitled element';
  const body = $('snippetBody').value.trim();
  if(!body) return;
  if(editingId){
    const s = data.tabs[activeTab].snippets.find(function(x){ return x.id === editingId; });
    if(s){ s.title = title; s.body = body; }
  } else {
    data.tabs[activeTab].snippets.unshift({id: makeId(), title: title, body: body});
  }
  editingId = null;
  selectedSnippetId = null;
  sortElementsMode = false;
  clearEditor();
  $('snippetTitle').value = '';
  $('snippetBody').value = '';
  $('saveSnippet').textContent = 'Add element';
  save(); renderSnippets();
};
$('clearForm').onclick = function(){ $('snippetTitle').value = ''; $('snippetBody').value = ''; $('saveSnippet').textContent = 'Add element'; };
$('sortElements').onclick = function(){
  sortElementsMode = !sortElementsMode;
  renderSnippets();
};
$('search').oninput = renderSnippets;
outEl.oninput = function(){ data.drafts[activeTab] = outEl.value; save(); };
$('newLine').onclick = function(){ outEl.value = outEl.value.trimEnd() + '\n\n'; outEl.focus(); data.drafts[activeTab] = outEl.value; save(); };
$('clearEmail').onclick = function(){ outEl.value = ''; data.drafts[activeTab] = ''; save(); };
$('copyEmail').onclick = function(){ copyText(outEl.value, 'copyStatus'); };

$('editTabTitle').onclick = function(){
  if(activeTab === quoteTabIndex) return;
  $('tabNameInput').value = data.tabs[activeTab].name || ('Tab ' + (activeTab + 1));
  $('tabRenameBox').classList.remove('hidden');
  $('tabNameInput').focus();
  $('tabNameInput').select();
};
$('cancelRenameTab').onclick = function(){ $('tabRenameBox').classList.add('hidden'); };
$('renameTab').onclick = function(){
  if(activeTab === quoteTabIndex) return;
  const newName = $('tabNameInput').value.trim();
  if(!newName) return;
  data.tabs[activeTab].name = newName;
  save();
  renderTabs();
  $('tabRenameBox').classList.add('hidden');
};

$('tabNameInput').addEventListener('keydown', function(e){
  if(e.key === 'Enter') $('renameTab').click();
});


$('copyEditor').onclick = function(){ copyStyledHtml($('richEditor').innerHTML || '', 'editorCopyStatus'); };
$('saveEditorElement').onclick = function(){
  if(!selectedSnippetId) return;
  const s = data.tabs[activeTab].snippets.find(function(x){ return x.id === selectedSnippetId; });
  if(!s) return;
  s.title = $('editorTitle').value.trim() || 'Untitled element';
  s.body = $('richEditor').innerHTML.trim();
  save();
  renderSnippets();
};
$('addEditorToEmail').onclick = function(){ addToEmail(plainTextFromHtml($('richEditor').innerHTML)); };
$('deleteEditorElement').onclick = function(){ if(selectedSnippetId) deleteSnippet(selectedSnippetId); };
document.querySelectorAll('#richToolbar button[data-command]').forEach(function(btn){
  btn.onclick = function(){
    $('richEditor').focus();
    document.execCommand(btn.dataset.command, false, null);
  };
});
function updateQuoteSettingsColour(){
  const type = $('clientType').value;
  const card = $('quoteSettingsCard');
  if(!card) return;

  card.className = 'card quote-settings-card';

  if(type === 'commercial_ex'){
    card.classList.add('type-commercial-ex');
  } else if(type === 'commercial_inc'){
    card.classList.add('type-commercial-inc');
  } else if(type === 'private_residential'){
    card.classList.add('type-private-residential');
  } else {
    card.classList.add('type-private-venue');
  }
}

function loadQuoteFields(){
  const q = data.quote;
  $('clientType').value = q.clientType || 'commercial_ex';
  $('deliveryFee').value = String(q.deliveryFee ?? defaultDeliveryFor(q.clientType));
  $('afterhours').checked = !!q.afterhours;
  $('weeklyHire').checked = !!q.weeklyHire;
  $('quoteClient').value = q.client || '';
  $('quoteIntro').value = q.intros[$('clientType').value] || defaultIntroMap[$('clientType').value];
  $('quoteOutput').value = q.output || '';
  updateQuoteSettingsColour();
}
function persistQuoteFields(){
  const type = $('clientType').value;
  data.quote.clientType = type;
  data.quote.deliveryFee = Number($('deliveryFee').value);
  data.quote.afterhours = $('afterhours').checked;
  data.quote.weeklyHire = $('weeklyHire').checked;
  data.quote.client = $('quoteClient').value;
  data.quote.intros[type] = $('quoteIntro').value;
  data.quote.output = $('quoteOutput').value;
  save();
}
function clearPackageForm(){
  editingPackageId = null;
  $('packageName').value = '';
  renderPackageItemChecks([]);
}

function renderPackageList(){
  const box = $('packageList');
  if(!box) return;
  box.innerHTML = '';
  const packages = data.quote.packages || [];
  if(!packages.length){
    box.innerHTML = '<span class="small">No packages yet. Open Manage list to create one.</span>';
    return;
  }
  packages.forEach(function(pkg){
    const btn = document.createElement('button');
    btn.className = 'package-pill';
    btn.textContent = pkg.name;
    btn.onclick = function(){
      if(manageItems){
        editPackage(pkg.id);
      } else {
        addPackageToQuote(pkg.id);
      }
    };
    box.appendChild(btn);
  });
}

function renderPackageItemChecks(selectedIds){
  const box = $('packageItemChecks');
  if(!box) return;
  box.innerHTML = '';
  if(!data.quote.items.length){
    box.innerHTML = '<div class="small">No inventory items yet.</div>';
    return;
  }
  data.quote.items.forEach(function(item){
    const label = document.createElement('label');
    label.innerHTML = '<input type="checkbox" value=""><span></span>';
    const input = label.querySelector('input');
    input.value = item.id;
    input.checked = selectedIds.includes(item.id);
    label.querySelector('span').textContent = item.name + ' - ' + money(item.price);
    box.appendChild(label);
  });
}

function editPackage(id){
  const pkg = data.quote.packages.find(function(p){ return p.id === id; });
  if(!pkg) return;
  editingPackageId = id;
  $('packageName').value = pkg.name;
  renderPackageItemChecks(pkg.itemIds || []);
  $('packageManagerBlock').classList.remove('collapsed');
  if(!manageItems) $('toggleManageItems').click();
}

function addPackageToQuote(id){
  const pkg = data.quote.packages.find(function(p){ return p.id === id; });
  if(!pkg) return;
  (pkg.itemIds || []).forEach(function(itemId){
    const item = data.quote.items.find(function(i){ return i.id === itemId; });
    if(item) addQuoteItem(item, true);
  });
  buildQuoteText();
}

function getFilteredQuoteItems(){
  const q = $('itemSearch').value.trim().toLowerCase();
  return data.quote.items.filter(function(i){ return !q || i.name.toLowerCase().includes(q); });
}

function resetQuoteItemSearch(){
  const search = $('itemSearch');
  if(search) search.value = '';
  highlightedQuoteItemIndex = 0;
  renderQuoteItems();
}

function addQuoteItem(item, skipBuild, resetSearchAfterAdd){
  data.quote.selected.push({id: makeId(), itemId: item.id, name: item.name, price: Number(item.price), qty: 1, weeklyExcluded: !!item.weeklyExcluded});
  if(!skipBuild) buildQuoteText();
  if(resetSearchAfterAdd) resetQuoteItemSearch();
}

function renderQuoteItems(){
  const items = getFilteredQuoteItems();
  if(highlightedQuoteItemIndex >= items.length) highlightedQuoteItemIndex = Math.max(0, items.length - 1);
  const section = $('quoteItemsSection');
  if(section) section.classList.toggle('manage-mode', manageItems);
  renderPackageList();
  renderPackageItemChecks(editingPackageId ? ((data.quote.packages.find(function(p){ return p.id === editingPackageId; }) || {}).itemIds || []) : []);
  $('quoteItemList').innerHTML = '';
  if(!items.length){ $('quoteItemList').innerHTML = '<div class="empty">No matching items.</div>'; return; }
  items.forEach(function(item, index){
    const div = document.createElement('div');
    div.className = 'quote-item' + (index === highlightedQuoteItemIndex ? ' highlighted' : '');
    div.innerHTML = '<div class="item-title"><strong></strong></div><div class="item-actions"><button class="ghost edit small-btn">Edit</button><button class="danger del small-btn">Delete</button></div>';
    div.querySelector('strong').textContent = item.name;
    div.title = 'Click to add ' + item.name;
div.onmouseenter = function(){
  if(manageItems) return;
  highlightedQuoteItemIndex = index;
  document.querySelectorAll('#quoteItemList .quote-item').forEach(function(el){
    el.classList.remove('highlighted');
  });
  div.classList.add('highlighted');
};

    div.onclick = function(e){
      if(e.target.closest('button')) return;
      if(manageItems) return;
      addQuoteItem(item, false, true);
    };

    div.querySelector('.edit').onclick = function(e){ e.stopPropagation(); editItem(item.id); };
    div.querySelector('.del').onclick = function(e){
      e.stopPropagation();
      data.quote.items = data.quote.items.filter(function(i){ return i.id !== item.id; });
      data.quote.selected = data.quote.selected.filter(function(s){ return s.itemId !== item.id; });
      data.quote.packages.forEach(function(pkg){ pkg.itemIds = (pkg.itemIds || []).filter(function(id){ return id !== item.id; }); });
      save(); renderQuoteItems(); buildQuoteText();
    };
    $('quoteItemList').appendChild(div);
  });
}
function renderSelected(){
  const box = $('selectedItems');
  box.innerHTML = '';
  if(!data.quote.selected.length){ box.innerHTML = '<div class="empty">No quote items selected yet.</div>'; return; }

  function getDragAfterElement(container, y){
    const draggableElements = Array.from(container.querySelectorAll('.selected-item:not(.dragging)'));
    return draggableElements.reduce(function(closest, child){
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if(offset < 0 && offset > closest.offset){
        return {offset: offset, element: child};
      } else {
        return closest;
      }
    }, {offset: Number.NEGATIVE_INFINITY}).element;
  }

  box.ondragover = function(e){
    e.preventDefault();
    const afterElement = getDragAfterElement(box, e.clientY);
    const dragging = document.querySelector('.selected-item.dragging');
    if(!dragging) return;
    if(afterElement == null){
      box.appendChild(dragging);
    } else {
      box.insertBefore(dragging, afterElement);
    }
  };

  box.ondrop = function(e){
    e.preventDefault();
    const orderedIds = Array.from(box.querySelectorAll('.selected-item')).map(function(el){ return el.dataset.selectedId; });
    data.quote.selected.sort(function(a, b){
      return orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id);
    });
    draggedSelectedId = null;
    buildQuoteText();
  };

  data.quote.selected.forEach(function(sel){
    const div = document.createElement('div');
    div.className = 'selected-item';
    div.draggable = true;
    div.dataset.selectedId = sel.id;
    div.innerHTML = '<div class="item-title"><div class="row" style="gap:6px;min-width:0"><span class="drag-handle" title="Drag to reorder">☰</span><strong></strong></div><span class="price-pill"></span></div><div class="three"><input class="qty" type="number" min="1" step="1" /><input class="price" type="number" min="0" step="10" /><button class="danger remove">Remove</button></div>';
    div.querySelector('strong').textContent = sel.name;
    div.querySelector('.price-pill').textContent = money(sel.qty * sel.price);
    const qty = div.querySelector('.qty');
    const price = div.querySelector('.price');
    qty.value = sel.qty;
    price.value = sel.price;

    div.addEventListener('dragstart', function(){
      draggedSelectedId = sel.id;
      div.classList.add('dragging');
    });
    div.addEventListener('dragend', function(){
      div.classList.remove('dragging');
      draggedSelectedId = null;
    });

    function commitSelectedInputs(){
      sel.qty = Math.max(1, Number(qty.value) || 1);
      sel.price = Number(price.value) || 0;
      buildQuoteText();
    }

    qty.addEventListener('change', commitSelectedInputs);
    qty.addEventListener('blur', commitSelectedInputs);
    price.addEventListener('change', commitSelectedInputs);
    price.addEventListener('blur', commitSelectedInputs);

    qty.addEventListener('keydown', function(e){ if(e.key === 'Enter') qty.blur(); });
    price.addEventListener('keydown', function(e){ if(e.key === 'Enter') price.blur(); });
    div.querySelector('.remove').onclick = function(){ data.quote.selected = data.quote.selected.filter(function(x){ return x.id !== sel.id; }); buildQuoteText(); };
    box.appendChild(div);
  });
}
function buildQuoteText(){
  persistQuoteFields();
  const q = data.quote;
  const type = q.clientType || 'commercial_ex';
  const weeklyMultiplier = q.weeklyHire ? 1.5 : 1;
  function effectiveItemPrice(i){
    const itemMultiplier = (q.weeklyHire && !i.weeklyExcluded) ? weeklyMultiplier : 1;
    return (Number(i.price) || 0) * itemMultiplier;
  }
  const subtotal = q.selected.reduce(function(sum, i){
    return sum + ((Number(i.qty) || 1) * effectiveItemPrice(i));
  }, 0);
  const selectedItemCount = q.selected.reduce(function(sum, i){ return sum + (Number(i.qty) || 1); }, 0);
  const eligibleDiscountSubtotal = q.selected.reduce(function(sum, i){
    const basePrice = Number(i.price) || 0;
    if(basePrice <= 250) return sum;
    return sum + ((Number(i.qty) || 1) * effectiveItemPrice(i));
  }, 0);
  const hasDiscountExcludedItems = q.selected.some(function(i){ return (Number(i.price) || 0) <= 250; });
  const packageDiscount = (type === 'private_residential' && selectedItemCount >= 3) ? eligibleDiscountSubtotal * 0.20 : 0;
  const delivery = Number(q.deliveryFee) || 0;
  const afterhours = q.afterhours ? 250 : 0;
  const total = subtotal + delivery + afterhours;
  const gstOnEx = total * 0.10;
  const gstIncluded = total / 11;
  const lines = [];
  const intro = (q.intros[type] || defaultIntroMap[type] || '').replaceAll('[Client Name]', q.client || '[Client Name]').trim();
  if(intro) lines.push(intro);
  q.selected.forEach(function(i){
    const displayPrice = effectiveItemPrice(i);
    lines.push((i.qty > 1 ? i.qty + ' x ' : '') + i.name + ' - ' + money(displayPrice) + (i.qty > 1 ? ' each' : ''));
  });


  if(delivery > 0) lines.push('Delivery & Pick Up - ' + money(delivery));
  if(afterhours > 0) lines.push('Afterhours - ' + money(afterhours));
  lines.push('');
  if(type === 'commercial_ex'){
    lines.push('Total: ' + money(total) + ' + GST');
    lines.push('');
    if(afterhours > 0){
      lines.push('This includes delivery, setup and pack down as required.');
      lines.push('An afterhours fee applies as your delivery/pick-up falls outside our regular trading hours (weekdays, 9am–5pm).');
    } else if(delivery > 0){
      lines.push('Delivery and pick up as quoted to be during business hours (Mon-Fri, 9am-5pm).');
      lines.push('If required, we can arrange afterhours services for an additional $250 + gst.');
    }
    lines.push('');
  } else if(type === 'commercial_inc'){
    lines.push('Total: ' + money(total) + ' inc. GST');
    lines.push('');
    if(afterhours > 0){
      lines.push('This includes delivery, setup and pack down as required.');
      lines.push('An afterhours fee applies as your delivery/pick-up falls outside our regular trading hours (weekdays, 9am–5pm).');
    } else if(delivery > 0){
      lines.push('Delivery and pick up as quoted to be during business hours (Mon-Fri, 9am-5pm).');
      lines.push('If required, we can arrange afterhours services for an additional $250 + gst.');
    }
    lines.push('');
  } else {
    lines.push('Total: ' + money(total));
    if(type === 'private_residential' && selectedItemCount >= 3) lines.push('Total after Package Discount: ' + money(total - packageDiscount));
    lines.push('');
    if(type === 'private_residential' && selectedItemCount >= 3) lines.push('Hiring packages of 3 items or more items automatically applies a 20% package discount');
    if(type === 'private_residential' && selectedItemCount >= 3 && hasDiscountExcludedItems) lines.push('Please note: items priced at $250 or less do not qualify for the 20% package discount.');
    if(type === 'private_residential' && selectedItemCount === 2) lines.push('Just note if you hire another item, you receive a 20% package discount.')
    if(type === 'private_residential' && selectedItemCount === 2) lines.push('For example, an Upright Arcade is normally $300.')
    if(type === 'private_residential' && selectedItemCount === 2) lines.push('If you hire all 3 items your total price will be '  + money((subtotal + 300) * 0.80));
    if(type === 'private_hired_venue') lines.push('This includes delivery and pick up as required for your event.');
    if(type === 'private_hired_venue') lines.push('We can remove the afterhours if we are able to deliver on Friday and pick up Monday');
    lines.push('');
    if(type === 'private_residential') lines.push('These prices includes delivery on Friday with collection on Monday during regular business hours (residential addresses only)');
    lines.push('');
  }
  lines.push('Please let me know if you require further information.');

  $('quoteOutput').value = lines.join('\n');
  q.output = $('quoteOutput').value;
  renderSelected();
  renderTotals(subtotal, delivery, afterhours, total, gstOnEx, gstIncluded, type, packageDiscount);
  save();
}
function renderTotals(subtotal, delivery, afterhours, total, gstOnEx, gstIncluded, type, packageDiscount){
  const isEx = type === 'commercial_ex';
  const isInc = type === 'commercial_inc';
  const discount = Number(packageDiscount || 0);
  $('totalsBox').innerHTML =
    '<div class="total-line"><span>Selected items</span><strong>' + money(subtotal) + '</strong></div>' +
    '<div class="total-line"><span>Delivery</span><strong>' + money(delivery) + '</strong></div>' +
    (afterhours ? '<div class="total-line"><span>Afterhours</span><strong>' + money(afterhours) + '</strong></div>' : '') +
    (discount ? '<div class="total-line"><span>Private package discount note</span><strong>-' + money(discount) + '</strong></div>' : '') +
    '<div class="total-line grand"><span>' + (isEx ? 'Total' : isInc ? 'Total inc GST' : 'Total') + '</span><span>' + money(total) + (isEx ? ' + gst' : '') + '</span></div>' +
    (isInc ? '<div class="total-line"><span>GST included</span><strong>' + money(gstIncluded) + '</strong></div>' : '') +
    '<div class="status-badges">' +
      '<span class="status-badge ' + (data.quote.weeklyHire ? 'on' : 'off') + '">Weekly Hire: ' + (data.quote.weeklyHire ? 'ON' : 'OFF') + '</span>' +
      '<span class="status-badge ' + (data.quote.afterhours ? 'on' : 'off') + '">Afterhours: ' + (data.quote.afterhours ? 'ON' : 'OFF') + '</span>' +
    '</div>';
}
function editItem(id){
  const item = data.quote.items.find(function(i){ return i.id === id; });
  if(!item) return;
  editingItemId = id;
  $('itemName').value = item.name;
  $('itemPrice').value = item.price;
  $('itemWeeklyExcluded').checked = !!item.weeklyExcluded;
  $('saveItem').textContent = 'Save changes';
  $('itemManagerBlock').classList.remove('collapsed');
  $('addItemPanel').classList.remove('hidden');
}
$('toggleManageItems').onclick = function(){
  manageItems = !manageItems;
  $('addItemPanel').classList.toggle('hidden', !manageItems);
  $('toggleManageItems').textContent = manageItems ? 'Done managing' : 'Manage list';
  renderQuoteItems();
  renderPackageList();
  renderPackageItemChecks(editingPackageId ? ((data.quote.packages.find(function(p){ return p.id === editingPackageId; }) || {}).itemIds || []) : []);
};
$('saveItem').onclick = function(){
  const name = $('itemName').value.trim();
  const price = Number($('itemPrice').value) || 0;
  const weeklyExcluded = $('itemWeeklyExcluded').checked;
  if(!name) return;
  if(editingItemId){
    const item = data.quote.items.find(function(i){ return i.id === editingItemId; });
    if(item){
      item.name = name;
      item.price = price;
      item.weeklyExcluded = weeklyExcluded;
      data.quote.selected.forEach(function(s){ if(s.itemId === editingItemId){ s.name = name; s.price = price; s.weeklyExcluded = weeklyExcluded; } });
    }
  } else {
    data.quote.items.unshift({id: makeId(), name: name, price: price, weeklyExcluded: weeklyExcluded});
  }
  editingItemId = null;
  $('itemName').value = '';
  $('itemPrice').value = '';
  $('itemWeeklyExcluded').checked = false;
  $('saveItem').textContent = 'Save item';
  save(); renderQuoteItems(); buildQuoteText();
};
$('clearItem').onclick = function(){ editingItemId = null; $('itemName').value = ''; $('itemPrice').value = ''; $('itemWeeklyExcluded').checked = false; $('saveItem').textContent = 'Save item'; };

$('clearSelectedItems').onclick = function(){
  data.quote.selected = [];
  data.quote.afterhours = false;
  data.quote.weeklyHire = false;
  $('afterhours').checked = false;
  $('weeklyHire').checked = false;
  buildQuoteText();
};
$('clientType').addEventListener('change', function(){
  const oldType = data.quote.clientType;
  if(oldType) data.quote.intros[oldType] = $('quoteIntro').value;
  const newType = $('clientType').value;
  data.quote.clientType = newType;
  $('deliveryFee').value = String(defaultDeliveryFor(newType));
  $('quoteIntro').value = data.quote.intros[newType] || defaultIntroMap[newType];
  updateQuoteSettingsColour();
  buildQuoteText();
});
['deliveryFee','afterhours','weeklyHire','quoteClient','quoteIntro'].forEach(function(id){ $(id).addEventListener('input', buildQuoteText); });
$('quoteOutput').oninput = function(){ data.quote.output = $('quoteOutput').value; save(); };
$('itemSearch').oninput = function(){
  highlightedQuoteItemIndex = 0;
  renderQuoteItems();
};

$('itemSearch').addEventListener('keydown', function(e){
  if(manageItems) return;
  const items = getFilteredQuoteItems();

  if(e.key === 'ArrowDown'){
    if(!items.length) return;
    e.preventDefault();
    highlightedQuoteItemIndex = Math.min(highlightedQuoteItemIndex + 1, items.length - 1);
    renderQuoteItems();
    const highlighted = document.querySelector('#quoteItemList .quote-item.highlighted');
    if(highlighted) highlighted.scrollIntoView({block:'nearest'});
    return;
  }

  if(e.key === 'ArrowUp'){
    if(!items.length) return;
    e.preventDefault();
    highlightedQuoteItemIndex = Math.max(highlightedQuoteItemIndex - 1, 0);
    renderQuoteItems();
    const highlighted = document.querySelector('#quoteItemList .quote-item.highlighted');
    if(highlighted) highlighted.scrollIntoView({block:'nearest'});
    return;
  }

  if(e.key !== 'Enter') return;
  const selectedMatch = items[highlightedQuoteItemIndex] || items[0];
  if(!selectedMatch) return;
  e.preventDefault();
  addQuoteItem(selectedMatch, false, true);
});
$('copyQuote').onclick = function(){ copyText($('quoteOutput').value, 'quoteCopyStatus'); };



function setFullBackupStatus(text){
  const el = $('fullBackupStatus');
  if(!el) return;
  el.textContent = text;
  setTimeout(function(){ el.textContent = ''; }, 2400);
}

function getFullBackupPayload(){
  persistQuoteFields();
  return {
    version: 1,
    type: 'email-response-builder-full-backup',
    exportedAt: new Date().toISOString(),
    storageKey: STORAGE_KEY,
    data: normalizeData(JSON.parse(JSON.stringify(data)))
  };
}

function exportFullBackup(){
  const payload = JSON.stringify(getFullBackupPayload(), null, 2);
  const blob = new Blob([payload], {type: 'application/json'});
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0,10);
  a.href = URL.createObjectURL(blob);
  a.download = 'email-builder-full-backup-' + date + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  setFullBackupStatus('Backed up');
}

function importFullBackupFromFile(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(){
    try{
      const imported = JSON.parse(reader.result);
      const rawData = imported && imported.data ? imported.data : imported;
      const restored = normalizeData(rawData);
      data = restored;
      selectedSnippetId = null;
      editingId = null;
      editingItemId = null;
      editingPackageId = null;
      sortElementsMode = false;
      manageItems = false;
      activeTab = Math.min(activeTab, quoteTabIndex);
      save();
      applyTheme();
      renderTabs();
      loadTabNameField();
      outEl.value = data.drafts[activeTab] || '';
      clearEditor();
      renderSnippets();
      loadQuoteFields();
      renderQuoteItems();
      renderPackageList();
      updateQuoteSettingsColour();
      buildQuoteText();
      setFullBackupStatus('Restored');
    }catch(err){
      alert('Restore failed: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function setElementsBackupStatus(text){
  const el = $('elementsBackupStatus');
  if(!el) return;
  el.textContent = text;
  setTimeout(function(){ el.textContent = ''; }, 2200);
}

function getEmailElementsExportPayload(){
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tabs: data.tabs.slice(0, quoteTabIndex).map(function(tab, index){
      return {
        name: tab.name || ('Tab ' + (index + 1)),
        snippets: (tab.snippets || []).map(function(s){
          return {id: s.id, title: s.title, body: s.body};
        })
      };
    })
  };
}

function exportEmailElements(){
  const payload = JSON.stringify(getEmailElementsExportPayload(), null, 2);
  const blob = new Blob([payload], {type: 'application/json'});
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0,10);
  a.href = URL.createObjectURL(blob);
  a.download = 'email-elements-' + date + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  setElementsBackupStatus('Exported');
}

function importEmailElementsFromFile(file, mode){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(){
    try{
      const imported = JSON.parse(reader.result);
      const cleanTabs = normalizeImportedEmailElements(imported);
      if(!cleanTabs.length) throw new Error('No valid email elements found.');

      if(mode === 'replace'){
        cleanTabs.forEach(function(tab, index){
          if(index >= quoteTabIndex) return;
          data.tabs[index].name = tab.name || ('Tab ' + (index + 1));
          data.tabs[index].snippets = tab.snippets || [];
        });
      } else {
        cleanTabs.forEach(function(tab, index){
          if(index >= quoteTabIndex) return;
          if(tab.name && (!data.tabs[index].name || data.tabs[index].name === ('Tab ' + (index + 1)))) data.tabs[index].name = tab.name;
          const existingKeys = new Set((data.tabs[index].snippets || []).map(function(s){
            return (String(s.title || '').trim().toLowerCase() + '|' + String(s.body || '').trim());
          }));
          (tab.snippets || []).forEach(function(s){
            const key = String(s.title || '').trim().toLowerCase() + '|' + String(s.body || '').trim();
            if(!existingKeys.has(key)){
              data.tabs[index].snippets.push({id: makeId(), title: s.title, body: s.body});
              existingKeys.add(key);
            }
          });
        });
      }

      selectedSnippetId = null;
      editingId = null;
      sortElementsMode = false;
      clearEditor();
      save();
      renderTabs();
      loadTabNameField();
      renderSnippets();
      setElementsBackupStatus(mode === 'replace' ? 'Imported & replaced' : 'Imported & merged');
    }catch(err){
      alert('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function setBackupStatus(text){
  const el = $('backupStatus');
  if(!el) return;
  el.textContent = text;
  setTimeout(function(){ el.textContent = ''; }, 2200);
}

function exportQuoteItems(){
  const items = data.quote.items.map(function(item){
    return {id: item.id, name: item.name, price: Number(item.price || 0), weeklyExcluded: !!item.weeklyExcluded};
  });
  const payload = JSON.stringify(items, null, 2);
  const blob = new Blob([payload], {type: 'application/json'});
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0,10);
  a.href = URL.createObjectURL(blob);
  a.download = 'quote-price-list-backup-' + date + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  setBackupStatus('Exported');
}

function importQuoteItemsFromFile(file, mode){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(){
    try{
      const imported = JSON.parse(reader.result);
      if(!Array.isArray(imported)) throw new Error('Import file must be a JSON array.');

      const cleanItems = imported
        .filter(function(item){ return item && String(item.name || '').trim(); })
        .map(function(item){
          return {
            id: makeId(),
            name: String(item.name || '').trim(),
            price: Number(item.price || 0),
            weeklyExcluded: !!item.weeklyExcluded
          };
        });

      if(!cleanItems.length) throw new Error('No valid items found.');

      if(mode === 'replace'){
        data.quote.items = cleanItems;
        data.quote.selected = [];
      } else {
        const existingNames = new Set(data.quote.items.map(function(item){ return item.name.trim().toLowerCase(); }));
        cleanItems.forEach(function(item){
          const key = item.name.trim().toLowerCase();
          if(!existingNames.has(key)){
            data.quote.items.push(item);
            existingNames.add(key);
          }
        });
      }

      save();
      renderQuoteItems();
      buildQuoteText();
      setBackupStatus(mode === 'replace' ? 'Imported & replaced' : 'Imported & merged');
    }catch(err){
      alert('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
}

document.querySelectorAll('.collapsible-toggle').forEach(function(btn){
  btn.onclick = function(){
    const id = btn.dataset.collapse;
    const block = $(id);
    if(block) block.classList.toggle('collapsed');
  };
});

$('savePackage').onclick = function(){
  const name = $('packageName').value.trim();
  if(!name) return;
  const checked = Array.from(document.querySelectorAll('#packageItemChecks input:checked')).map(function(input){ return input.value; });
  if(editingPackageId){
    const pkg = data.quote.packages.find(function(p){ return p.id === editingPackageId; });
    if(pkg){ pkg.name = name; pkg.itemIds = checked; }
  } else {
    data.quote.packages.push({id: makeId(), name: name, itemIds: checked});
  }
  editingPackageId = null;
  $('packageName').value = '';
  save();
  renderPackageList();
  renderPackageItemChecks([]);
};

$('clearPackage').onclick = clearPackageForm;

$('deletePackage').onclick = function(){
  if(!editingPackageId) return;
  data.quote.packages = data.quote.packages.filter(function(p){ return p.id !== editingPackageId; });
  save();
  clearPackageForm();
  renderPackageList();
};


if($('exportFullBackup')) $('exportFullBackup').onclick = exportFullBackup;
if($('restoreFullBackup')) $('restoreFullBackup').onclick = function(){
  $('restoreFullBackupFile').value = '';
  $('restoreFullBackupFile').click();
};
if($('restoreFullBackupFile')) $('restoreFullBackupFile').addEventListener('change', function(){
  importFullBackupFromFile(this.files[0]);
});

if($('exportElements')) $('exportElements').onclick = exportEmailElements;
if($('importElementsMerge')) $('importElementsMerge').onclick = function(){
  pendingElementsImportMode = 'merge';
  $('importElementsFile').value = '';
  $('importElementsFile').click();
};
if($('importElementsReplace')) $('importElementsReplace').onclick = function(){
  pendingElementsImportMode = 'replace';
  $('importElementsFile').value = '';
  $('importElementsFile').click();
};
if($('importElementsFile')) $('importElementsFile').addEventListener('change', function(){
  importEmailElementsFromFile(this.files[0], pendingElementsImportMode);
});

$('exportItems').onclick = exportQuoteItems;
$('importMergeItems').onclick = function(){
  pendingImportMode = 'merge';
  $('importItemsFile').value = '';
  $('importItemsFile').click();
};
$('importReplaceItems').onclick = function(){
  pendingImportMode = 'replace';
  $('importItemsFile').value = '';
  $('importItemsFile').click();
};
$('importItemsFile').addEventListener('change', function(){
  importQuoteItemsFromFile(this.files[0], pendingImportMode);
});

function normalEmailHtml(html){
  return '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.4;color:#222222;">' + (html || '') + '</div>';
}

function copyStyledHtml(html, statusTarget){
  const styledHtml = normalEmailHtml(html || '');
  const plain = plainTextFromHtml(styledHtml);
  function statusEl(){ return typeof statusTarget === 'string' ? $(statusTarget) : statusTarget; }
  function done(){ const el = statusEl(); if(el){ el.textContent = 'Copied'; setTimeout(function(){ el.textContent = ''; }, 1600); } }
  function fallback(){
    const temp = document.createElement('div');
    temp.contentEditable = 'true';
    temp.style.position = 'fixed';
    temp.style.left = '-9999px';
    temp.style.top = '0';
    temp.innerHTML = styledHtml;
    document.body.appendChild(temp);
    const range = document.createRange();
    range.selectNodeContents(temp);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('copy');
    selection.removeAllRanges();
    temp.remove();
    done();
  }

  if(navigator.clipboard && window.ClipboardItem){
    const item = new ClipboardItem({
      'text/html': new Blob([styledHtml], {type: 'text/html'}),
      'text/plain': new Blob([plain], {type: 'text/plain'})
    });
    navigator.clipboard.write([item]).then(done).catch(fallback);
  } else {
    fallback();
  }
}

function copyText(text, statusId){
  function done(){ $(statusId).textContent = 'Copied'; setTimeout(function(){ $(statusId).textContent = ''; }, 1600); }
  if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(done).catch(fallback); }
  else fallback();
  function fallback(){ const temp = document.createElement('textarea'); temp.value = text; document.body.appendChild(temp); temp.select(); document.execCommand('copy'); temp.remove(); done(); }
}

save();
renderTabs();
loadTabNameField();
renderSnippets();
outEl.value = data.drafts[activeTab] || '';
loadQuoteFields();
if(!HAD_LOCAL_DATA_ON_LOAD) loadEmailElementsFromJson();
loadQuoteItemsFromJson();
renderQuoteItems();
renderPackageList();
updateQuoteSettingsColour();
buildQuoteText();
