import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { getEnvConfig } from '../../utils/env';

export interface ProfilePictureResponse {
  url?: string;
  error?: string;
}

export const useProfilePicture = (userId: string) => {
  console.log('useProfilePicture hook initialized with userId:', userId);
  
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProfilePicture = async () => {
    if (!userId) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${getEnvConfig().foundationUrl}/media/profile-picture/${userId}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setProfilePictureUrl(data.url || null);
      } else {
        // Profile picture not found is not an error
        if (response.status === 404) {
          setProfilePictureUrl(null);
        } else {
          const errorData = await response.json();
          setError(errorData.error || 'Failed to load profile picture');
        }
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const uploadProfilePicture = async (file: File) => {
    console.log('uploadProfilePicture called with file:', file.name, 'size:', file.size, 'type:', file.type);
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      console.log('Invalid file type:', file.type);
      setError('Invalid file type. Allowed: jpg, jpeg, png, gif, webp');
      return null;
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      console.log('File too large:', file.size);
      setError('File too large. Maximum size is 10MB');
      return null;
    }

    console.log('File validation passed, starting upload');

    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('user_id', userId);

      const response = await fetch(`${getEnvConfig().foundationUrl}/media/upload/profile-picture`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      console.log('Upload URL:', `${getEnvConfig().foundationUrl}/media/upload/profile-picture`);
      console.log('Upload response status:', response.status);
      console.log('Upload response ok:', response.ok);

      if (response.ok) {
        const result = await response.json();
        console.log('Upload response data:', result);
        setProfilePictureUrl(result.url || null);
        return result.url;
      } else {
        const errorData = await response.json();
        console.log('Upload error data:', errorData);
        setError(errorData.error || 'Upload failed');
        return null;
      }
    } catch (error) {
      setError('Network error. Please try again.');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    console.log('handleFileSelect called');
    const file = event.target.files?.[0];
    console.log('Selected file:', file);
    if (!file) {
      console.log('No file selected');
      return null;
    }

    console.log('Calling uploadProfilePicture with file:', file.name);
    return await uploadProfilePicture(file);
  };

  const refreshProfilePicture = async () => {
    await loadProfilePicture();
  };

  const clearError = () => setError(null);

  // Load profile picture on mount
  useEffect(() => {
    loadProfilePicture();
  }, []);

  return {
    profilePictureUrl,
    isLoading,
    uploading,
    error,
    fileInputRef,
    uploadProfilePicture,
    handleFileSelect,
    refreshProfilePicture,
    clearError
  };
};
