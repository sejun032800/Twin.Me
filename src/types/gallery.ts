export interface Photo {
  id: string;
  uri: string;
  createdAt: number; // Unix timestamp ms
  extractedTags: string[]; // e.g. ['#파리여행', '#sns용사진']
}

export interface MemoryRing {
  id: string;
  title: string; // '#' stripped, e.g. '파리여행'
  coverUri: string;
  photos: Photo[]; // sorted ascending by createdAt
}
