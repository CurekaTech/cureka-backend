import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';
import { mapHierarchyLevelToFilterType } from '../interfaces/public-brand-category-filter.interface';
import { IPublicFacetCategoryNode } from '../interfaces/public-product-filters.interface';
import { buildCategoryPermalink } from './category-permalink.util';

export interface FacetCategorySourceNode {
  id: string;
  refId: string;
  name: string;
  slug: string;
  position: number;
  hierarchyLevel: number;
  parentCategoryId: string | null;
}

export const collectAncestorIds = (
  nodeId: string,
  parentById: Map<string, string | null>,
): string[] => {
  const ancestors: string[] = [];
  let current = parentById.get(nodeId) ?? null;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    ancestors.push(current);
    current = parentById.get(current) ?? null;
  }
  return ancestors;
};

export const buildFacetCategoryForest = (
  nodes: FacetCategorySourceNode[],
  counts: Map<string, number>,
  options?: {
    lockedCategoryId?: string;
    selectedIds?: Set<string>;
  },
): IPublicFacetCategoryNode[] => {
  if (!nodes.length) return [];

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parentById = new Map(nodes.map((node) => [node.id, node.parentCategoryId]));

  const keep = new Set<string>();
  for (const [id, count] of counts) {
    if (count > 0 && byId.has(id)) {
      keep.add(id);
      for (const ancestorId of collectAncestorIds(id, parentById)) {
        if (byId.has(ancestorId)) keep.add(ancestorId);
      }
    }
  }

  if (options?.lockedCategoryId && byId.has(options.lockedCategoryId)) {
    const allowed = new Set<string>([options.lockedCategoryId]);
    const visit = (parentId: string) => {
      for (const node of nodes) {
        if (node.parentCategoryId === parentId) {
          allowed.add(node.id);
          visit(node.id);
        }
      }
    };
    visit(options.lockedCategoryId);
    for (const id of [...keep]) {
      if (!allowed.has(id)) keep.delete(id);
    }
    keep.add(options.lockedCategoryId);
  }

  const selectedIds = options?.selectedIds ?? new Set<string>();

  const slugPathFor = (node: FacetCategorySourceNode): string[] => {
    const slugs: string[] = [];
    let current: FacetCategorySourceNode | undefined = node;
    const guard = new Set<string>();
    while (current && !guard.has(current.id)) {
      guard.add(current.id);
      slugs.unshift(current.slug);
      current = current.parentCategoryId ? byId.get(current.parentCategoryId) : undefined;
    }
    return slugs;
  };

  const buildNode = (node: FacetCategorySourceNode): IPublicFacetCategoryNode => {
    const slugPath = slugPathFor(node);
    const hierarchyLevel = node.hierarchyLevel as CategoryHierarchyLevel;
    const children = nodes
      .filter((child) => child.parentCategoryId === node.id && keep.has(child.id))
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      .map((child) => buildNode(child));

    return {
      id: node.id,
      refId: node.refId,
      name: node.name,
      slug: node.slug,
      slugPath,
      permalink: buildCategoryPermalink(slugPath),
      position: node.position,
      hierarchyLevel,
      type: mapHierarchyLevelToFilterType(hierarchyLevel),
      productCount: counts.get(node.id) ?? 0,
      selected: selectedIds.has(node.id),
      children,
    };
  };

  if (options?.lockedCategoryId) {
    const locked = byId.get(options.lockedCategoryId);
    return locked && keep.has(locked.id) ? [buildNode(locked)] : [];
  }

  const roots = nodes
    .filter((node) => {
      if (!keep.has(node.id)) return false;
      if (!node.parentCategoryId) return true;
      return !keep.has(node.parentCategoryId);
    })
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  return roots.map((root) => buildNode(root));
};

export const flattenFacetCategoryTree = (
  nodes: IPublicFacetCategoryNode[],
): IPublicFacetCategoryNode[] => {
  const flat: IPublicFacetCategoryNode[] = [];
  const walk = (items: IPublicFacetCategoryNode[]) => {
    for (const item of items) {
      flat.push(item);
      if (item.children.length) walk(item.children);
    }
  };
  walk(nodes);
  return flat;
};

export const paginateFacetCategoryRoots = (
  roots: IPublicFacetCategoryNode[],
  limit: number,
  cursorId?: string,
): { items: IPublicFacetCategoryNode[]; hasMore: boolean } => {
  if (!cursorId) {
    return {
      items: roots.slice(0, limit),
      hasMore: roots.length > limit,
    };
  }
  const index = roots.findIndex((root) => root.id === cursorId);
  const start = index >= 0 ? index + 1 : 0;
  const sliced = roots.slice(start, start + limit + 1);
  const hasMore = sliced.length > limit;
  return {
    items: hasMore ? sliced.slice(0, limit) : sliced,
    hasMore,
  };
};
