import React from "react";
import {
  ArrowLeft, Calendar, Check, CheckCircle, ChevronForward, CircleHelp,
  ClipboardPen, CloudUpload, FileText, Fingerprint, FolderOpen, Globe,
  Home, Info, Lock, LogOut, MapPin, MedicalCross, MessageCircle,
  MessagesSquare, Pencil, People, Phone, Plus, Star, Trash2, User,
  X, Bell, Eye, Search, Image, FileText as DocumentText, Send, AlertCircle, LayoutGrid,
  Activity, Venus, Accessibility, Sparkles, Cloud, Scissors, ShieldCheck, Utensils, Droplets, Zap,
} from "lucide-react-native";

const icons: Record<string, any> = {
  "arrow-back": ArrowLeft, "calendar": Calendar, "calendar-outline": Calendar,
  "grid": LayoutGrid, "grid-outline": LayoutGrid,
  "checkmark": Check, "checkmark-circle": CheckCircle, "chevron-forward": ChevronForward,
  "create": ClipboardPen, "create-outline": Pencil, "cloud-upload": CloudUpload,
  "documents": FileText, "documents-outline": FileText, "finger-print": Fingerprint,
  "folder-open-outline": FolderOpen, "globe": Globe, "home": Home, "home-outline": Home,
  "information-circle": Info, "lock-closed": Lock, "log-out": LogOut,
  "location": MapPin, "medical": MedicalCross, "chatbubble-ellipses": MessageCircle,
  "chatbubbles": MessagesSquare, "people": People, "people-outline": People,
  "call": Phone, "add": Plus, "star": Star, "trash-outline": Trash2,
  "person": User, "person-outline": User, "close": X,
  "notifications": Bell, "notifications-outline": Bell, "eye-outline": Eye,
  "logo-google": Globe, "logo-whatsapp": MessageCircle,
  "search": Search, "image": Image, "document-text": DocumentText, "chatbubble": MessageCircle, "send": Send,
  "chatbubbles-outline": MessagesSquare, "alert-circle": AlertCircle,
  "pulse": Activity, "female": Venus, "walk": Accessibility, "sparkles": Sparkles,
  "cloud": Cloud, "cut": Scissors, "shield-checkmark": ShieldCheck, "restaurant": Utensils,
  "water": Droplets, "flash": Zap,
};

export default function Icon({ name, size = 24, color = "currentColor", ...props }: any) {
  const Component = icons[name] || CircleHelp;
  return <Component size={size} color={color} strokeWidth={2} {...props} />;
}
