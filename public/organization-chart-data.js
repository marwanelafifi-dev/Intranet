const text = value => String(value || '').trim();
const emailKey = value => text(value).toLocaleLowerCase();
const nameSort = (left, right) => text(left.member.name).localeCompare(text(right.member.name), undefined, { sensitivity:'base' });

function sortBranches(nodes) {
  nodes.sort(nameSort);
  nodes.forEach(node => sortBranches(node.children));
}

export function buildOrganizationChart(members = []) {
  const nodes = members.map((member, index) => ({
    id: text(member.id) || `member-${index}`,
    index,
    member,
    parent:null,
    children:[]
  }));
  const byEmail = new Map(nodes.map(node => [emailKey(node.member.companyEmail), node]).filter(([email]) => email));

  nodes.forEach(node => {
    const manager = byEmail.get(emailKey(node.member.directManager));
    if (manager && manager !== node) node.parent = manager;
  });
  nodes.forEach(node => {
    const seen = new Set([node]);
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (!seen.has(parent)) { seen.add(parent); continue; }
      node.parent = null;
      break;
    }
  });
  const roots = [];
  nodes.forEach(node => (node.parent ? node.parent.children : roots).push(node));
  sortBranches(roots);
  return roots;
}

export function visibleOrganizationNodeIds(roots, query = '') {
  const term = text(query).toLocaleLowerCase();
  if (!term) return null;
  const visible = new Set();
  const matches = member => [member.name, member.companyEmail, member.role, member.department, member.sector, member.directManager]
    .some(value => text(value).toLocaleLowerCase().includes(term));
  const includeDescendants = node => {
    visible.add(node.id);
    node.children.forEach(includeDescendants);
  };
  const visit = (node, ancestors = []) => {
    if (matches(node.member)) {
      ancestors.forEach(ancestor => visible.add(ancestor.id));
      includeDescendants(node);
    }
    node.children.forEach(child => visit(child, [...ancestors, node]));
  };
  roots.forEach(root => visit(root));
  return visible;
}
