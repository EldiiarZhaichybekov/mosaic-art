import {createRepository, type LibraryAsset, type Catalog} from '../asset-library';
const photo:LibraryAsset={id:'test',type:'photo',title:{en:'Test',ru:'Тест',zh:'测试'},categoryId:'nature',tags:[],thumbnailUrl:'/library/test/thumb.webp',sourceUrl:'/library/test/source.jpg',recommendedCanvas:'40x40',difficulty:'easy',conversionQuality:'good',sourceName:'Test',author:'Test',license:'Owned',licenseUrl:'https://example.com',precomputed:{url:'/library/test/precomputed.json'}};
const catalog:Catalog={schemaVersion:1,categories:[{id:'nature',title:{en:'Nature'}}],assets:[photo]};
const repository=createRepository({load:()=>catalog});
repository.getAssets({type:'photo',lang:'zh',page:1}).then(page=>page.items.map(asset=>asset.id));
// @ts-expect-error unsupported asset type
repository.getAssets({type:'video'});
// @ts-expect-error unknown canvas format
photo.recommendedCanvas='50x50';
