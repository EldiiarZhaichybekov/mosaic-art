export type Localized = Partial<Record<'ru'|'en'|'zh', string>> & {en: string};
export interface LibraryAsset {
 id: string; type: 'silhouette'|'photo'; title: Localized; categoryId: string;
 tags: string[]; thumbnailUrl: string; sourceUrl: string; presetId?: string;
 featured?: boolean; sortOrder?: number; recommendedCanvas?: '30x40'|'40x40';
 difficulty?: 'easy'|'medium'|'hard'; conversionQuality?: 'excellent'|'good'|'difficult';
 sourceName?: string; author?: string; license?: string; licenseUrl?: string; sourcePage?: string;
 precomputed?: {url: string};
}
export interface Category {id: string; title: Localized}
export interface Catalog {schemaVersion: 1; categories: Category[]; assets: LibraryAsset[]}
export interface Repository {
 getAsset(id: string): Promise<LibraryAsset|null>;
 getCategories(type: LibraryAsset['type']): Promise<Category[]>;
 getAssets(query?: {type?: LibraryAsset['type'];category?: string;search?: string;page?: number;lang?: string}): Promise<{items:LibraryAsset[];total:number;page:number;pageSize:number;hasMore:boolean}>;
}
export function createRepository(options?: {load?: ()=>Promise<Catalog>|Catalog}): Repository;
