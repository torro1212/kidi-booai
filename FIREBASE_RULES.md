# Firebase Security Rules

כדי שהנתונים יישמרו, יש להגדיר את ה-Rules ב-Firebase Console:

## Firestore Rules

1. עבור ל-[Firebase Console](https://console.firebase.google.com/)
2. בחר את הפרויקט `kidi-books`
3. לחץ על **Firestore Database** בצד שמאל
4. לחץ על **Rules** בחלק העליון
5. החלף את ה-Rules ל:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write access to prompts collection
    match /prompts/{document=**} {
      allow read, write: if true;
    }
    
    // Allow read/write access to books collection
    match /books/{document=**} {
      allow read, write: if true;
    }
  }
}
```

6. לחץ **Publish**

## Storage Rules

1. לחץ על **Storage** בצד שמאל
2. אם עדיין לא הוגדר, לחץ **Get Started**
3. לחץ על **Rules** בחלק העליון
4. החלף את ה-Rules ל:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

5. לחץ **Publish**

> ⚠️ **שים לב:** Rules אלה מאפשרות גישה לכולם. בפרודקשן תרצה לשנות ל-Authentication.
