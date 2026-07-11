import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// The account layer sits ABOVE the existing per-character Player rows
// (see player.entity.ts) — an account authenticates with email/username/
// password and, once logged in, picks (or creates) one of its own
// characters to actually play (see characters/characters.controller.ts).
// The game socket itself still authenticates with a character-scoped
// session token exactly like before (see auth.service.ts's
// selectCharacter/issueCharacterSession) — this table and everything
// downstream of it is a new layer in FRONT of that, not a replacement.
@Entity({ name: 'accounts' })
export class Account {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: 'varchar', length: 254, unique: true })
  email!: string;

  @Index()
  @Column({ type: 'varchar', length: 16, unique: true })
  username!: string;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
